# Running on a server

*One container, one daily run, state in volumes, a phone notice when a form needs you.*

The tool was built to run on a Mac you watch. This setup runs the same code on any Linux
server with Docker: headless Chromium, `jev daily` once a day at a time you set, and Telegram
for the things only you can do. It sends applications with nobody watching, so it keeps
every rule in `docs/SAFETY.md` and every limit in `docs/DAILY.md`.

## What works, and what does not

| | On a server |
|---|---|
| Finding, rating, filling, reading back, sending | Same code as on a Mac |
| `daily` inside your policy and limits | Yes. It does nothing without `data/policy.json` |
| Claude writing open answers | Through the Claude API (`ANTHROPIC_API_KEY`), billed to that key. There is no Claude Code login in a container |
| The slash skills (`/setup`, `/apply`, `/report`) | No. They need Claude Code. Make your profile first (below), and use the commands |
| A human check, an emailed code, a sign-in only you can finish | The form is left and you get a Telegram message with the link. Open it in your own browser and finish by hand. See "When a form needs you" |
| Workday and other boards that want an account | Skipped, as everywhere, unless you set up accounts |
| Desktop notifications, Keychain, launchd | Not used. Telegram, environment variables, and the container's own loop replace them |

It is not a fit for GitHub Actions: the record of what was sent lives in `data/` and
`applications/`, and a run that starts with an empty record could send the same application
twice. A server with a disk keeps it.

## Before you start

- A Linux server with Docker and Docker Compose, 2 GB of memory or more. Any small VPS does.
- An Anthropic API key (`ANTHROPIC_API_KEY`). Claude does all the thinking by default, so no other key is needed. It costs about
  1.6 cents to rate a posting (a first search rates 100 to 150, later ones only the new) and about 5 cents to fill a form, billed to that key.
  The daily run stops at 4 dollars a day unless your policy says otherwise. An OpenRouter key is optional and cheaper (`docs/JEV.md`).
- Optional but recommended: a Telegram bot (talk to @BotFather) and your chat id.
- A profile, a standing policy and a resume. The profile is the one place the truth can go wrong, so write it yourself:

```bash
cp data/profile.analyst.example.json profile.json    # fill it in
cp data/policy.example.json policy.json              # make it yours: target, where, levels, excluded employers
```

In the profile, set `resume.path` to `/app/documents/resume.pdf`.

## Set up

On the server:

```bash
git clone <your repository> && cd <it>/jev
cp .env.cloud.example .env && chmod 600 .env     # fill in the keys; set JEV_DAILY_AT and TZ
docker compose build
```

Put your profile and policy in as base64 in `.env`, which the container writes on first start only (a file already in the volume is never overwritten):

```bash
base64 -w0 profile.json     # paste the output after JEV_PROFILE_B64=   (on a Mac: base64 -i profile.json)
base64 -w0 policy.json      # JEV_POLICY_B64=
```

The resume goes in after the first start, as a file. Do not send it as base64 in `.env`: one environment variable is limited to about 128 KB, which a resume can pass, and then the container will not start.

```bash
docker compose up -d
docker compose exec -T jev sh -c 'cat > documents/resume.pdf' < resume.pdf
```

To change a file later, write it into the volume the same way, as the container's own user:

```bash
docker compose exec -T jev sh -c 'cat > data/policy.json' < policy.json
```

Check it, then rehearse. A rehearsal fills and checks forms and sends nothing:

```bash
docker compose run --rm jev node bin/jev.js doctor
docker compose run --rm jev node bin/jev.js daily --dry --target 3
```

Read what the rehearsal would have sent. Ashby saves what you type as an unsubmitted draft even in a
rehearsal; that is not an application, and the employer is not told. When it is right, go live
small: keep `target` at 3 to 5 in the policy for the first week.

```bash
docker compose up -d
docker compose logs -f
```

The container checks the setup, then waits for `JEV_DAILY_AT` and runs `daily` each day. Set
`JEV_RUN_ON_START=1` once if you want a run right away.

## Day to day

```bash
docker compose exec jev node bin/jev.js status                 # where you stand
docker compose exec jev node bin/jev.js log                    # what was sent and what was left for you
docker compose exec jev node bin/jev.js cost                   # what it cost
docker compose cp jev:/app/applications/applied.csv .          # the records are plain CSV
docker compose exec jev node bin/jev.js report --static /tmp/r.html && docker compose cp jev:/tmp/r.html .
docker compose exec jev node bin/jev.js daily --stop           # finish the application in progress, start no other
docker compose stop                                            # the same, then the container stops (it waits up to 3 minutes)
```

To pause for good, `docker compose stop`. To change the policy, edit `data/policy.json` in the volume;
a run reads it once, when it starts.

## Watching progress: the dashboard

The dashboard (Today, Needs you, Applications, Automation) runs inside the container on port 4545 and is
published on the server's own loopback only, so it is not on the internet. Reach it with an SSH tunnel from your own computer:

```bash
ssh -L 4545:localhost:4545 you@your-server
```

Then open http://localhost:4545 in your browser. Leave the tunnel open while you look. It shows what was sent today, what
needs you, the status of every job, and lets you mark a job by hand. Set `JEV_DASHBOARD=0` in `.env` to turn it off.

The Automation screen's schedule switch is for a Mac. On a server the container runs the day by itself; change the time with
`JEV_DAILY_AT` in `.env` and `docker compose up -d`.

With Telegram set up, the day's summary and anything that needs you also reach your phone.

## When a form needs you

A board that shows a CAPTCHA or emails a code to prove a person is applying cannot be finished by
the tool, and it will not try. The run records the job as waiting, moves on, and (with Telegram set up)
sends you the company, the role, what to do, and the link. Open the link in your own browser and
apply by hand, then tell the tool:

```bash
docker compose exec jev node bin/jev.js log                    # find the job id
docker compose exec jev node bin/jev.js mark <id> --status applied
```

A second human check in a day stops that day's run, and the board is left alone until tomorrow.

## Know the risks

- **Headless Chromium says so.** Its user agent contains `HeadlessChrome`, and a server's address is a data-centre address.
  Some boards will challenge or refuse it more than they would a person at a laptop. The tool does not hide this and does not
  try to pass a check. Expect more forms to land in the by-hand list than on a Mac.
- **Boards have terms.** Some employers' terms discourage automated applications. Sending with nobody watching is your decision.
  The limits in `DAILY` exist to look like one careful person; do not raise them to send more.
- **The profile is what you swear to.** Work authorization, education and dates come from it and are never changed to fit a form.
  A wrong profile is wrong on every form.
- **Keep the volumes.** `docker compose down -v` deletes the record of what was sent, and the next run could send an application twice.
- **Keys on the server.** `.env` holds two paid keys. Keep it `chmod 600`, off git, and rotate a key if the server is shared.
- **Not built or run end to end yet.** The Dockerfile, the entrypoint and Chrome's headless launch were checked in pieces
  (the entrypoint's loop, seeding and shutdown against a stub; Chrome's launch and the real-browser tests on Linux). The image has
  not been built, and JEV and form filling have not been run against live services. Run the rehearsal and watch the first week.

## Updating

```bash
git pull && docker compose build && docker compose up -d
```

Your volumes keep their files, including `data/voice.md` and the examples from the image you first ran.
