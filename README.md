# js-terminal-arena

A multiplayer trivia game you play entirely in the terminal. Everyone joins
a room by name, readies up, and races to answer multiple-choice questions —
faster correct answers score more points, à la Kahoot, but over raw
WebSockets with a text UI.

## Why this exists

Building a real-time multiplayer game (even a small one) forces you to deal
with the stuff toy CRUD apps skip: authoritative server state (the server
owns the question, the timer, and the score — clients just render), handling
players answering at different speeds, advancing the round early once
everyone's in, and keeping the UI responsive to a stream of server-pushed
events with no request/response pattern.

## Architecture

```
server/   Node WebSocket server — the single source of truth for game state.
          Rooms are created on demand by room code; each Room is a small
          state machine (lobby → countdown → question → reveal → ... → gameover).
client/   Terminal UI (blessed) + a plain WebSocket connection. Renders
          whatever the server broadcasts; never computes scores itself.
```

- **Rooms**: any player can create a room just by naming one when joining.
- **Ready-up**: the game auto-starts once everyone in the room is ready.
- **Scoring**: `max(100, round(1000 * remaining_time / time_limit))` for a
  correct answer, 0 for wrong/no answer — so speed matters, but a last-second
  correct answer still beats a wrong one.
- **Early advance**: once every connected player has answered, the round
  ends immediately instead of waiting out the full timer.

## Running locally

Start the server:

```bash
npm run install:all
npm run server
```

Then, in one terminal per player:

```bash
npm run client -- --name=Akanksha --room=friday-quiz
```

Flags (or equivalent `ARENA_NAME` / `ARENA_ROOM` / `ARENA_SERVER` env vars):

| Flag        | Default                 |
| ----------- | ------------------------ |
| `--name`    | `Guest<random>`          |
| `--room`    | `lobby`                  |
| `--server`  | `ws://localhost:4200`    |

**Controls**: `1`–`4` to answer, `r` to toggle ready, `q` to quit.

## Server env vars

| Var                        | Default | Purpose                          |
| --------------------------- | ------- | --------------------------------- |
| `PORT`                       | 4200    | HTTP/WS listen port               |
| `ARENA_QUESTIONS_PER_GAME`   | 8       | Questions per round               |
| `ARENA_QUESTION_TIME_MS`     | 15000   | Time limit per question           |
| `ARENA_REVEAL_TIME_MS`       | 4000    | Pause between reveal and next Q   |
| `ARENA_COUNTDOWN_MS`         | 3000    | Countdown before the first question |

The question bank lives in `server/src/data/questions.json` — add your own
categories/questions there.
