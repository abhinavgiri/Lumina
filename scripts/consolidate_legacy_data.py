"""One-off maintenance: consolidate legacy anonymous data and drop test rows.

WHY THIS EXISTS: sessions used to be "the cookie IS the user id". When that was
replaced with real server-side sessions (see src/lib/session.ts), every old
cookie became invalid, stranding data across ~13 anonymous users — including one
holding 8 real resumes. Nothing was lost, it just became unreachable from a
browser. This moves it onto one user and mints a session so it's reachable again.

SAFE BY DEFAULT: prints a plan and changes nothing unless --apply is passed.
A timestamped backup of dev.db is taken before any write.

    python scripts/consolidate_legacy_data.py                       # dry run
    python scripts/consolidate_legacy_data.py --apply               # consolidate
    python scripts/consolidate_legacy_data.py --attach-to you@x.com # hand it to an account

NOTE: the session cookie is httpOnly, so it CANNOT be set from the DevTools
console — the browser refuses to let JavaScript overwrite an httpOnly cookie.
Use --attach-to instead: sign up normally in the app, then run this to move the
consolidated data onto that account.
"""
from __future__ import annotations

import base64
import hashlib
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dev.db")
APPLY = "--apply" in sys.argv

#: The user that keeps everything — the richest existing account.
KEEP_USER = "cmrm1qlf70000g0vbfcxn742p"

#: Resumes that are obviously development fixtures, matched on their own text.
TEST_RESUME_PREFIXES = ("Test User", "Jane Doe", "Polish Test")

#: Users created by automated smoke tests during the auth / tracker work.
#: Listed explicitly rather than matched by date, so nothing real is caught.
SMOKE_TEST_USERS = (
    "cmsjaa8ff00009ovb0rj7ns83",
    "cmsjaa8jf00019ovbirnnvnh8",
    "cmsjaa8mw00029ovbjsifjksn",
    "cmsjaa8rc00039ovbhiz3fjgg",
    "cmsjaamyq00049ovbx9z5s4fa",
    "cmsji5nji000048vb9sdkhlk0",  # test@example.com
    "cmsk1182c0000k4vbbe1wv5u8",  # tracker smoke test: Druva
    "cmsk11k2z0006k4vbcp1zjjkz",  # tracker smoke test: Other
    "cmsk15ueu000ak4vbi65ix0t9",  # tracker smoke test: Postman x2
)


def attach_to(email: str) -> None:
    """Move the consolidated data onto an existing account, by email.

    This is the supported way to reclaim it: sign up in the app first (which
    creates the account), then run this. Avoids any cookie fiddling — the
    session cookie is httpOnly and cannot be set from the browser console.
    """
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    target = con.execute(
        "select id, email from User where lower(email)=?", (email.strip().lower(),)
    ).fetchone()
    if not target:
        con.close()
        sys.exit(f"No account with email {email!r}. Sign up in the app first, then re-run.")
    if target["id"] == KEEP_USER:
        con.close()
        sys.exit("That account already owns the consolidated data — nothing to do.")

    counts = con.execute(
        "select (select count(*) from Resume where userId=?) r,"
        "       (select count(*) from JobDesc where userId=?) j",
        (KEEP_USER, KEEP_USER),
    ).fetchone()
    print(f"Moving {counts['r']} resumes and {counts['j']} job descriptions -> {target['email']}")

    if not APPLY:
        print("\nDry run. Re-run with --apply to execute.")
        con.close()
        return

    backup = f"{DB}.backup-{datetime.now():%Y%m%d-%H%M%S}"
    shutil.copy2(DB, backup)
    with con:
        con.execute("update Resume set userId=? where userId=?", (target["id"], KEEP_USER))
        con.execute("update JobDesc set userId=? where userId=?", (target["id"], KEEP_USER))
        con.execute("update Application set userId=? where userId=?", (target["id"], KEEP_USER))
        con.execute("delete from User where id=? and email is null", (KEEP_USER,))
    print(f"Backup: {os.path.basename(backup)}\nDone — sign in as {target['email']} to see it.")
    con.close()


def main() -> None:
    if "--attach-to" in sys.argv:
        return attach_to(sys.argv[sys.argv.index("--attach-to") + 1])

    print("=== APPLYING ===\n" if APPLY else "=== DRY RUN (pass --apply to execute) ===\n")
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    if not cur.execute("select 1 from User where id=?", (KEEP_USER,)).fetchone():
        sys.exit(f"Keep-user {KEEP_USER} not found — aborting.")

    # 1. Test-fixture resumes
    test_resumes = [
        r for r in cur.execute("select id, userId, substr(rawText,1,40) t, rawText from Resume")
        if r["rawText"].startswith(TEST_RESUME_PREFIXES)
    ]
    print(f"Test-fixture resumes to DELETE ({len(test_resumes)}):")
    for r in test_resumes:
        print(f"   {r['id']}  {r['t']!r}")

    # 2. Smoke-test users (cascades their resumes/JDs/applications)
    placeholders = ",".join("?" * len(SMOKE_TEST_USERS))
    smoke = cur.execute(
        f"""select u.id, u.email,
              (select count(*) from Resume r where r.userId=u.id) rc,
              (select count(*) from JobDesc j where j.userId=u.id) jc,
              (select count(*) from Application a where a.userId=u.id) ac
            from User u where u.id in ({placeholders})""",
        SMOKE_TEST_USERS,
    ).fetchall()
    print(f"\nSmoke-test users to DELETE ({len(smoke)}) — cascades their rows:")
    for u in smoke:
        print(f"   {u['id']}  email={u['email'] or '-':20} resumes={u['rc']} jds={u['jc']} apps={u['ac']}")

    # 3. Real data to consolidate
    test_ids = {r["id"] for r in test_resumes}
    excluded = set(SMOKE_TEST_USERS) | {KEEP_USER}
    moving_resumes = [
        r for r in cur.execute("select id, userId, substr(rawText,1,40) t from Resume")
        if r["id"] not in test_ids and r["userId"] not in excluded
    ]
    moving_jds = [
        j for j in cur.execute("select id, userId from JobDesc") if j["userId"] not in excluded
    ]
    print(f"\nReal resumes to MOVE onto {KEEP_USER} ({len(moving_resumes)}):")
    for r in moving_resumes:
        print(f"   {r['id']}  {r['t']!r}")
    print(f"Job descriptions to MOVE: {len(moving_jds)}")

    if not APPLY:
        print("\nNothing changed. Re-run with --apply to execute.")
        con.close()
        return

    backup = f"{DB}.backup-{datetime.now():%Y%m%d-%H%M%S}"
    shutil.copy2(DB, backup)
    print(f"\nBackup written: {os.path.basename(backup)}")

    cur.execute("PRAGMA foreign_keys = ON")
    with con:
        if test_ids:
            con.execute(
                f"delete from Resume where id in ({','.join('?' * len(test_ids))})", tuple(test_ids)
            )
        con.execute(f"delete from User where id in ({placeholders})", SMOKE_TEST_USERS)
        if moving_resumes:
            ids = tuple(r["id"] for r in moving_resumes)
            con.execute(
                f"update Resume set userId=? where id in ({','.join('?' * len(ids))})",
                (KEEP_USER, *ids),
            )
        if moving_jds:
            ids = tuple(j["id"] for j in moving_jds)
            con.execute(
                f"update JobDesc set userId=? where id in ({','.join('?' * len(ids))})",
                (KEEP_USER, *ids),
            )
        # Anonymous users now holding nothing at all are just noise.
        con.execute(
            """delete from User where email is null
                 and id not in (select distinct userId from Resume)
                 and id not in (select distinct userId from JobDesc)
                 and id not in (select distinct userId from Application)"""
        )

        # Mint a session so the consolidated account is reachable from a browser.
        token = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
        con.execute(
            "insert into Session (id, tokenHash, userId, expiresAt, createdAt) values (?,?,?,?,?)",
            (
                "sess" + base64.urlsafe_b64encode(os.urandom(12)).decode().rstrip("="),
                hashlib.sha256(token.encode()).hexdigest(),
                KEEP_USER,
                (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
                datetime.now(timezone.utc).isoformat(),
            ),
        )

    counts = con.execute(
        """select (select count(*) from Resume where userId=?) r,
                  (select count(*) from JobDesc where userId=?) j,
                  (select count(*) from User) u""",
        (KEEP_USER, KEEP_USER),
    ).fetchone()
    print("\n=== DONE ===")
    print(f"Account {KEEP_USER}: {counts['r']} resumes, {counts['j']} job descriptions.")
    print(f"Users remaining in the database: {counts['u']}")
    print("\nTo open it in your browser, paste this into the DevTools console on http://localhost:3000 :\n")
    print(f'  document.cookie = "lumina_session={token}; path=/; max-age=31536000"; location.reload()\n')
    print("Then click 'Save my work' and sign up — that claims this account permanently.")
    con.close()


if __name__ == "__main__":
    main()
