#!/usr/bin/env python3
"""Startup patch (idempotent): make Hermes' clarify buttons show the OPTION TEXT, not 1/2/3.

Hermes' gateway/platforms/telegram.py `send_clarify()` deliberately labels each inline button with
its index (`str(idx + 1)`) and lists the full options as a numbered list in the message body — its
comment says this is "to avoid Telegram truncation". The operator wants the actual choice ON the
button. The callback_data already carries the index (`cl:<id>:<idx>`), so the label is free to be the
text. We put the (truncated) option on the button, and only keep the numbered body list when an
option is long enough to be clipped on its button.

Hermes' source is baked into the image, so this runs at container start (via the compose `command`)
as the `hermes` user, which owns the file. It is:
  - idempotent — re-running is a no-op once the marker is present;
  - safe — if a Hermes upgrade changes that code the regex simply won't match and we log a warning;
    nothing else is touched and the gateway still boots.
Pinned to the telegram.py shipped with the pinned HERMES_IMAGE_TAG — re-verify on upgrade.
"""
import os
import re
import sys
import time

PATH = "/opt/hermes/gateway/platforms/telegram.py"
MARKER = "# [studio] option text on button"

# (capture the leading newline + indentation so we preserve it)
BTN_RE = re.compile(r"(\n[ \t]*)str\(idx \+ 1\),")
BTN_NEW = ('(str(choices[idx])[:57] + "…") if len(str(choices[idx])) > 58 '
           'else str(choices[idx]),  ' + MARKER)

BODY_RE = re.compile(r'(\n[ \t]*)text \+= f"\\n\\n\{option_lines\}"')
BODY_NEW = ('text += ("\\n\\n" + option_lines) if any(len(str(c)) > 58 for c in choices) '
            'else ""  # [studio] hide numbered list when buttons carry the text')


def main():
    # The image chowns /opt/hermes to the hermes user during boot (stage2-hook.sh). The gateway can
    # start before that finishes, so the file is briefly not ours to write. Wait until it is (or give
    # up and leave it unpatched — the gateway still boots).
    for _ in range(180):  # up to ~90s — the chown -R over .venv/node_modules can be slow on first boot
        if os.access(PATH, os.W_OK):
            break
        time.sleep(0.5)
    else:
        print("[studio patch] telegram.py not writable after waiting — left unpatched", file=sys.stderr)
        return
    try:
        src = open(PATH, encoding="utf-8").read()
    except OSError as e:
        print(f"[studio patch] cannot read {PATH}: {e}", file=sys.stderr)
        return
    if MARKER in src:
        print("[studio patch] clarify buttons already show option text — nothing to do")
        return

    done = 0
    src, n = BTN_RE.subn(lambda m: m.group(1) + BTN_NEW, src, count=1)
    if n:
        done += 1
    else:
        print("[studio patch] WARNING: clarify button label not found — buttons left as 1/2/3 "
              "(did Hermes change?)", file=sys.stderr)

    src, n = BODY_RE.subn(lambda m: m.group(1) + BODY_NEW, src, count=1)
    if n:
        done += 1
    else:
        print("[studio patch] WARNING: clarify body list not found — left as-is", file=sys.stderr)

    if done:
        try:
            open(PATH, "w", encoding="utf-8").write(src)
            print(f"[studio patch] clarify buttons now show the option text ({done}/2 blocks patched)")
        except OSError as e:
            print(f"[studio patch] cannot write {PATH}: {e}", file=sys.stderr)


main()
