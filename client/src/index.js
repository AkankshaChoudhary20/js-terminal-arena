#!/usr/bin/env node
import WebSocket from 'ws';
import { buildUi, renderLeaderboard } from './ui.js';

function parseArgs(argv) {
  const args = { name: null, room: 'lobby', server: 'ws://localhost:4200' };
  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    if (key === 'name') args.name = value;
    if (key === 'room') args.room = value;
    if (key === 'server') args.server = value;
  }
  args.name ??= process.env.ARENA_NAME ?? `Guest${Math.floor(Math.random() * 1000)}`;
  args.room = process.env.ARENA_ROOM ?? args.room;
  args.server = process.env.ARENA_SERVER ?? args.server;
  return args;
}

const args = parseArgs(process.argv.slice(2));
const { screen, header, questionBox, leaderboard, log } = buildUi();

let currentQuestion = null;
let hasAnswered = false;
let countdownTimer = null;
let players = [];

function setHeader(text) {
  header.setContent(`{center}Terminal Arena — room: ${args.room} — ${text}{/center}`);
  screen.render();
}

function stopCountdownTimer() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function renderQuestion(q, remainingMsAtRender) {
  const lines = [
    `{bold}[${q.category}]{/bold} Question ${q.index + 1}/${q.total}`,
    '',
    q.text,
    '',
  ];
  q.choices.forEach((choice, i) => {
    lines.push(`  {yellow-fg}${i + 1}.{/yellow-fg} ${choice}`);
  });
  lines.push('');
  const secs = Math.max(0, Math.ceil(remainingMsAtRender / 1000));
  lines.push(hasAnswered ? '{green-fg}Answer locked in — waiting for others…{/green-fg}' : `{grey-fg}Time left: ${secs}s{/grey-fg}`);
  questionBox.setContent(lines.join('\n'));
  screen.render();
}

setHeader('connecting…');
const ws = new WebSocket(args.server);

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'join', name: args.name, room: args.room }));
});

ws.on('message', (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }

  switch (msg.type) {
    case 'joined': {
      setHeader(`joined as ${args.name}`);
      log.log(`{cyan-fg}Joined room "${msg.room}" as ${args.name}. Press [r] when ready.{/cyan-fg}`);
      break;
    }
    case 'players': {
      players = msg.players;
      renderLeaderboard(leaderboard, players);
      if (msg.state === 'lobby') {
        questionBox.setContent(
          `Waiting in lobby.\n\nPlayers:\n${players.map((p) => `  ${p.ready ? '✓' : '·'} ${p.name}`).join('\n')}\n\nPress [r] to toggle ready. Game starts when everyone is ready.`,
        );
      }
      screen.render();
      break;
    }
    case 'countdown': {
      setHeader('starting…');
      log.log(`{yellow-fg}Game starting in ${msg.seconds}s!{/yellow-fg}`);
      questionBox.setContent(`{center}Get ready! Starting in ${msg.seconds}...{/center}`);
      screen.render();
      break;
    }
    case 'question': {
      hasAnswered = false;
      currentQuestion = msg;
      setHeader(`question ${msg.index + 1}/${msg.total}`);
      const startedAt = Date.now();
      stopCountdownTimer();
      renderQuestion(msg, msg.timeLimitMs);
      countdownTimer = setInterval(() => {
        const remaining = msg.timeLimitMs - (Date.now() - startedAt);
        if (remaining <= 0) {
          stopCountdownTimer();
        }
        renderQuestion(msg, remaining);
      }, 500);
      break;
    }
    case 'reveal': {
      stopCountdownTimer();
      setHeader('reveal');
      const correctLetter = currentQuestion ? currentQuestion.choices[msg.correctIndex] : '?';
      log.log(`{bold}Correct answer: ${correctLetter}{/bold}`);
      for (const s of msg.scoreboard) {
        const tag = s.correct ? '{green-fg}✓{/green-fg}' : '{red-fg}✗{/red-fg}';
        log.log(`  ${tag} ${s.name}: +${s.pointsEarned} (total ${s.score})`);
      }
      players = msg.scoreboard.map((s) => ({ ...s, ready: true, connected: true }));
      renderLeaderboard(leaderboard, players);
      questionBox.setContent('{center}Round over — next question shortly…{/center}');
      screen.render();
      break;
    }
    case 'gameover': {
      stopCountdownTimer();
      setHeader('game over');
      const winner = msg.scoreboard[0];
      log.log(`{bold}{magenta-fg}Game over! Winner: ${winner ? winner.name : 'n/a'}{/magenta-fg}{/bold}`);
      const lines = ['{center}{bold}GAME OVER{/bold}{/center}', ''];
      msg.scoreboard.forEach((s, i) => lines.push(`  ${i + 1}. ${s.name} — ${s.score} pts`));
      lines.push('', 'Back to lobby shortly. Press [r] to ready up for a rematch.');
      questionBox.setContent(lines.join('\n'));
      screen.render();
      break;
    }
    default:
      break;
  }
});

ws.on('close', () => {
  setHeader('disconnected');
  log.log('{red-fg}Disconnected from server.{/red-fg}');
});

ws.on('error', (err) => {
  log.log(`{red-fg}Connection error: ${err.message}{/red-fg}`);
});

let ready = false;
screen.key(['r'], () => {
  ready = !ready;
  ws.send(JSON.stringify({ type: 'ready', ready }));
});

for (const key of ['1', '2', '3', '4']) {
  screen.key([key], () => {
    if (!currentQuestion || hasAnswered) return;
    const choiceIndex = Number(key) - 1;
    if (choiceIndex >= currentQuestion.choices.length) return;
    hasAnswered = true;
    ws.send(JSON.stringify({ type: 'answer', choiceIndex }));
    log.log(`{grey-fg}You answered: ${currentQuestion.choices[choiceIndex]}{/grey-fg}`);
    screen.render();
  });
}

screen.render();
