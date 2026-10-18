#!/usr/bin/env python3
"""dr4w home: the root sidecar that turns the hub's controller frames into a Bluetooth Pro Controller.

nxbt needs root (it reconfigures BlueZ and opens raw L2CAP sockets); the hub does not. This process
does only that one job: it listens on a Unix socket that the hub's group may use, accepts
newline-delimited JSON and refuses everything else.

    {"op": "frame", "b": <bitmask>, "lx": -100..100, "ly": .., "rx": .., "ry": ..}
    {"op": "release"}
    {"op": "status"}   ->  {"connected": true|false, "state": "<nxbt state>"}

All input is released when a client disconnects. The Switch's address is kept after the first
pairing in a root-only file, so later starts try to reconnect (a Switch 2 refuses; pair again).
Started by dr4w-home-nxbt.socket, it uses the socket systemd hands over and exits after IDLE_S without
a client; started by hand, it makes the socket itself and runs until stopped.
Self-check without nxbt or Bluetooth: python3 nxbt-sidecar.py --self-test
"""

import argparse
import grp
import json
import os
import signal
import socket
import socketserver
import subprocess
import sys
import threading
import time

# Bit order of the hub's GamepadFrame.b (packages/device-sdk/src/gamepad.ts, GAMEPAD_BUTTONS).
BUTTONS = [
    "a", "b", "x", "y", "l", "r", "zl", "zr", "plus", "minus", "home", "capture",
    "dpadUp", "dpadDown", "dpadLeft", "dpadRight", "lStick", "rStick",
]
# Our button name -> nxbt direct-input key (a tuple for keys inside a stick).
NXBT_KEYS = {
    "a": "A", "b": "B", "x": "X", "y": "Y", "l": "L", "r": "R", "zl": "ZL", "zr": "ZR",
    "plus": "PLUS", "minus": "MINUS", "home": "HOME", "capture": "CAPTURE",
    "dpadUp": "DPAD_UP", "dpadDown": "DPAD_DOWN", "dpadLeft": "DPAD_LEFT", "dpadRight": "DPAD_RIGHT",
    "lStick": ("L_STICK", "PRESSED"), "rStick": ("R_STICK", "PRESSED"),
}
AXES = ("lx", "ly", "rx", "ry")
MAX_LINE = 512
RETRY_S = 10  # after a crash, wait this long before starting a new controller (BlueZ needs the pause)
IDLE_S = 600  # started by dr4w-home-nxbt.socket: exit after this long with no hub connected
LISTEN_S = 170  # nxbt is discoverable for 180 s; renew before that runs out, and retry the known Switch
BLUEZ_OVERRIDE = "/run/systemd/system/bluetooth.service.d/nxbt.conf"  # written by nxbt on start


QUIET = False  # the self-test checks its own output only


def log(level, msg, **fields):
    if not QUIET:
        print(json.dumps({"level": level, "msg": msg, **fields}), flush=True)


def valid_frame(m):
    """Exactly op, b and four axes, all integers in range. Anything else is refused."""
    if set(m) != {"op", "b", *AXES}:
        return False
    ints = all(type(m[k]) is int for k in ("b", *AXES))  # bool is not int here
    return ints and 0 <= m["b"] < 2 ** len(BUTTONS) and all(-100 <= m[k] <= 100 for k in AXES)


def to_packet(m, packet):
    """Fill an nxbt input packet (from create_input_packet) from a valid frame."""
    for i, name in enumerate(BUTTONS):
        key = NXBT_KEYS[name]
        down = bool(m["b"] & (1 << i))
        if isinstance(key, tuple):
            packet[key[0]][key[1]] = down
        else:
            packet[key] = down
    # Same range and direction as nxbt (-100..100, up and right positive); clamp to be safe.
    clamp = lambda v: max(-100, min(100, v))  # noqa: E731
    packet["L_STICK"]["X_VALUE"] = clamp(m["lx"])
    packet["L_STICK"]["Y_VALUE"] = clamp(m["ly"])
    packet["R_STICK"]["X_VALUE"] = clamp(m["rx"])
    packet["R_STICK"]["Y_VALUE"] = clamp(m["ry"])
    return packet


class Clients:
    """How many hub connections are open, and since when there are none."""

    def __init__(self, now):
        self.lock = threading.Lock()
        self.count = 0
        self.alone_since = now

    def joined(self):
        with self.lock:
            self.count += 1

    def left(self, now):
        with self.lock:
            self.count -= 1
            if self.count == 0:
                self.alone_since = now

    def idle(self, now, after):
        with self.lock:
            return self.count == 0 and now - self.alone_since >= after


class Pad:
    """The one emulated controller. Every input goes through here, under a lock."""

    def __init__(self, nx, nxbt, address_file):
        self.nx = nx
        self.lock = threading.Lock()
        self.address_file = address_file
        self.saved = read_addresses(address_file)
        self.kind = nxbt.PRO_CONTROLLER
        self.index = None
        self.created_at = time.monotonic()
        self.index = self.create()

    def create(self):
        """A controller that first tries the saved Switch, then waits, discoverable, to be paired."""
        return self.nx.create_controller(self.kind, reconnect_address=self.saved or None)

    def recover(self, now):
        """Keep a controller the Switch can reach, whatever happened to the last one.

        When the Switch sleeps or refuses a reconnect, nxbt marks the controller crashed and stops; when
        it waits to be paired, it stops being discoverable after 180 s. Start a fresh controller after a
        crash (not sooner than RETRY_S after the last one) or when the pairing window is about to close.
        """
        state = self.state()
        if state == "connected":
            return
        age = now - self.created_at
        if age < RETRY_S or (state not in ("crashed", "unknown") and age < LISTEN_S):
            return
        if state == "crashed":
            errors = str(self.nx.state[self.index].get("errors") or "").strip().splitlines()
            log("error", "nxbt controller crashed", reason=errors[-1] if errors else "unknown")
        with self.lock:
            if self.index is not None:
                try:
                    self.nx.remove_controller(self.index)
                except ValueError:
                    pass  # a crashed controller may already be gone
            self.index, self.created_at = None, now  # if create fails, the next tick tries again
            self.index = self.create()
        log("info", "nxbt controller restarted", was=state, reconnect=bool(self.saved))

    def state(self):
        if self.index is None:
            return "unknown"
        try:
            return self.nx.state[self.index]["state"]
        except (KeyError, IndexError):
            return "unknown"

    def send(self, packet):
        """Input for a controller that is gone (crashed, being replaced) is dropped, not an error."""
        with self.lock:
            if self.index is None:
                return
            try:
                self.nx.set_controller_input(self.index, packet)
            except ValueError:
                pass

    def apply(self, frame):
        self.send(to_packet(frame, self.nx.create_input_packet()))

    def release(self):
        self.send(self.nx.create_input_packet())

    def remember_switch(self):
        """After the first pairing, keep the Switch's address so the next start reconnects."""
        if self.saved or self.state() != "connected":
            return
        found = self.nx.get_switch_addresses()
        if found:
            write_addresses(self.address_file, found)
            self.saved = found


def read_addresses(path):
    try:
        with open(path) as f:
            data = json.load(f)
        return [a for a in data if isinstance(a, str)] if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def write_addresses(path, addresses):
    os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(list(addresses), f)


def handle(pad, line):
    """One request line -> the reply line, or None when there is nothing to say."""
    try:
        m = json.loads(line)
    except ValueError:
        return {"error": "invalid"}
    if not isinstance(m, dict):
        return {"error": "invalid"}
    op = m.get("op")
    if op == "frame" and valid_frame(m):
        pad.apply(m)
        return None
    if op == "release" and set(m) == {"op"}:
        pad.release()
        return None
    if op == "status" and set(m) == {"op"}:
        state = pad.state()
        return {"connected": state == "connected", "state": state}
    return {"error": "invalid"}


def make_handler(pad, clients):
    class Handler(socketserver.StreamRequestHandler):
        def handle(self):
            clients.joined()
            try:
                while True:
                    line = self.rfile.readline(MAX_LINE + 1)
                    if not line:
                        return
                    if len(line) > MAX_LINE:
                        self.wfile.write(b'{"error":"invalid"}\n')
                        return
                    reply = handle(pad, line)
                    if reply is not None:
                        self.wfile.write((json.dumps(reply) + "\n").encode())
            except OSError:
                pass
            finally:
                pad.release()  # never leave a button held when the hub goes away
                clients.left(time.monotonic())

    return Handler


def serve(args):
    import nxbt  # only here: the self-test runs without nxbt or root

    nx = nxbt.Nxbt(disable_logging=True)  # restarts BlueZ with all plugins off (toggle_clean_bluez(True))
    pad = Pad(nx, nxbt, args.address_file)
    clients = Clients(time.monotonic())
    handler = make_handler(pad, clients)

    fd = listen_fd()
    if fd is not None:  # systemd made the socket (owner, group, mode) and keeps it after we exit
        server = socketserver.ThreadingUnixStreamServer(args.socket, handler, bind_and_activate=False)
        server.socket.close()
        server.socket = socket.socket(fileno=fd)
    else:
        if os.path.exists(args.socket):
            os.unlink(args.socket)
        os.makedirs(os.path.dirname(args.socket), exist_ok=True)
        old = os.umask(0o117)  # the socket is born 0660, never briefly world-writable
        server = socketserver.ThreadingUnixStreamServer(args.socket, handler)
        os.umask(old)
        os.chown(args.socket, -1, grp.getgrnam(args.group).gr_gid)
        os.chmod(args.socket, 0o660)
    server.daemon_threads = True

    def stop(*_):
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    def watch():
        while True:
            try:
                pad.remember_switch()
                pad.recover(time.monotonic())
                if fd is not None and clients.idle(time.monotonic(), IDLE_S):
                    log("info", "no hub for a while: stopping", idle_s=IDLE_S)
                    stop()
                    return
            except Exception as e:  # the watcher must outlive any one nxbt hiccup
                log("error", "watch failed", reason=repr(e))
            time.sleep(2)

    threading.Thread(target=watch, daemon=True).start()
    log("info", "nxbt sidecar listening", socket=args.socket)
    try:
        server.serve_forever()
    finally:
        try:
            pad.release()
        except Exception:
            pass  # nxbt's processes may already be gone (systemd signals the whole group)
        server.server_close()
        if fd is None and os.path.exists(args.socket):
            os.unlink(args.socket)
        restore_bluez()
        log("info", "nxbt sidecar stopped")
        # nxbt's multiprocessing children can block a normal exit; nothing is left to flush.
        os._exit(0)


def listen_fd():
    """The socket systemd hands over when dr4w-home-nxbt.socket starts us (sd_listen_fds), or None."""
    if os.environ.get("LISTEN_PID") == str(os.getpid()) and os.environ.get("LISTEN_FDS") == "1":
        return 3
    return None


def restore_bluez():
    """Give BlueZ its plugins back. Not nxbt.toggle_clean_bluez(False): it waits for the restart, and
    systemd will not restart bluetooth.service (we are ordered after it) until we have stopped."""
    try:
        os.remove(BLUEZ_OVERRIDE)
    except FileNotFoundError:
        return
    subprocess.run(["systemctl", "daemon-reload"], check=False)
    subprocess.run(["systemctl", "--no-block", "restart", "bluetooth"], check=False)


def self_test():
    global QUIET
    QUIET = True
    template = {
        "L_STICK": {"PRESSED": False, "X_VALUE": 0, "Y_VALUE": 0},
        "R_STICK": {"PRESSED": False, "X_VALUE": 0, "Y_VALUE": 0},
        **{k: False for k in NXBT_KEYS.values() if isinstance(k, str)},
    }
    fresh = lambda: json.loads(json.dumps(template))  # noqa: E731
    assert len(BUTTONS) == 18 and set(BUTTONS) == set(NXBT_KEYS)
    a_zr_ls = (1 << 0) | (1 << 7) | (1 << 16)
    p = to_packet({"op": "frame", "b": a_zr_ls, "lx": -100, "ly": 100, "rx": 5, "ry": 0}, fresh())
    assert p["A"] and p["ZR"] and p["L_STICK"]["PRESSED"] and not p["B"] and not p["R_STICK"]["PRESSED"]
    assert p["L_STICK"]["X_VALUE"] == -100 and p["L_STICK"]["Y_VALUE"] == 100 and p["R_STICK"]["X_VALUE"] == 5
    ok = {"op": "frame", "b": 0, "lx": 0, "ly": 0, "rx": 0, "ry": 0}
    assert valid_frame(ok)
    for bad in (
        {**ok, "lx": 101},
        {**ok, "b": 2 ** 18},
        {**ok, "b": -1},
        {**ok, "lx": 1.5},
        {**ok, "lx": True},
        {**ok, "extra": 1},
        {k: v for k, v in ok.items() if k != "ry"},
    ):
        assert not valid_frame(bad), bad

    class FakeNx:
        state = {0: {"state": "connected"}}
        sent = []

        def create_input_packet(self):
            return fresh()

        def set_controller_input(self, index, packet):
            self.sent.append(packet)

    pad = Pad.__new__(Pad)
    pad.nx, pad.index, pad.lock = FakeNx(), 0, threading.Lock()
    assert handle(pad, b'{"op":"status"}') == {"connected": True, "state": "connected"}
    assert handle(pad, json.dumps({**ok, "b": 1}).encode()) is None and pad.nx.sent[-1]["A"]
    assert handle(pad, b'{"op":"release"}') is None and not pad.nx.sent[-1]["A"]
    for bad in (b"nope", b"[]", b'{"op":"macro"}', b'{"op":"release","x":1}', b'{"op":"frame"}'):
        assert handle(pad, bad) == {"error": "invalid"}, bad

    class FakeLifecycle(FakeNx):
        def __init__(self):
            self.state, self.created = {0: {"state": "crashed", "errors": "x\nBrokenPipeError"}}, []

        def remove_controller(self, index):
            if index not in self.state:
                raise ValueError("Specified controller does not exist")  # as nxbt does
            self.state.pop(index)

        def create_controller(self, kind, reconnect_address=None):
            self.created.append(reconnect_address)
            index = len(self.created)
            self.state[index] = {"state": "reconnecting"}
            return index

    pad.nx, pad.kind, pad.created_at, pad.saved = FakeLifecycle(), "pro", 95.0, ["switch"]
    pad.recover(100.0)  # crashed, but too soon after the last start
    assert pad.nx.created == []
    pad.recover(105.0)  # crashed: a fresh controller that tries the saved Switch first
    assert pad.index == 1 and pad.nx.created == [["switch"]]
    pad.nx.state[1]["state"] = "connecting"  # waiting to be paired
    pad.recover(105.0 + LISTEN_S - 1)
    assert len(pad.nx.created) == 1
    pad.recover(105.0 + LISTEN_S)  # the pairing window is closing: renew it
    assert pad.index == 2 and len(pad.nx.created) == 2
    pad.nx.state[2]["state"] = "connected"
    pad.recover(1000.0)
    assert len(pad.nx.created) == 2
    pad.nx.state.pop(2)  # gone without a trace: "unknown" is recovered too
    pad.recover(1000.0)
    assert pad.index == 3
    pad.index = None  # a create that failed: input is dropped, not an error
    assert handle(pad, json.dumps(ok).encode()) is None and handle(pad, b'{"op":"release"}') is None
    clients = Clients(0.0)
    assert not clients.idle(IDLE_S - 1, IDLE_S) and clients.idle(IDLE_S, IDLE_S)
    clients.joined()
    assert not clients.idle(10_000.0, IDLE_S)  # never idle while the hub is connected
    clients.left(10_000.0)
    assert not clients.idle(10_000.0 + IDLE_S - 1, IDLE_S) and clients.idle(10_000.0 + IDLE_S, IDLE_S)
    print("self-test ok")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--socket", default="/run/dr4w-home/gamepad.sock")
    ap.add_argument("--group", default="dr4w-home", help="group allowed to use the socket")
    ap.add_argument("--address-file", default="/var/lib/dr4w-home-nxbt/switch-address.json")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        return self_test()
    if os.geteuid() != 0:
        sys.exit("nxbt needs root: run this as the dr4w-home-nxbt system service")
    serve(args)


if __name__ == "__main__":
    main()
