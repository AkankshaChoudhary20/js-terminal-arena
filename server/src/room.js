import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ALL_QUESTIONS = JSON.parse(readFileSync(join(__dirname, 'data', 'questions.json'), 'utf8'));

const QUESTIONS_PER_GAME = Number(process.env.ARENA_QUESTIONS_PER_GAME ?? 8);
const QUESTION_TIME_MS = Number(process.env.ARENA_QUESTION_TIME_MS ?? 15000);
const REVEAL_TIME_MS = Number(process.env.ARENA_REVEAL_TIME_MS ?? 4000);
const COUNTDOWN_MS = Number(process.env.ARENA_COUNTDOWN_MS ?? 3000);
const MIN_PLAYERS_TO_START = 1;

function shuffled(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class Room {
  constructor(code, onEmpty) {
    this.code = code;
    this.onEmpty = onEmpty;
    this.players = new Map(); // id -> { ws, name, score, ready, answeredIndex, answeredAt }
    this.state = 'lobby'; // lobby | countdown | question | reveal | gameover
    this.questions = [];
    this.questionIndex = -1;
    this.questionStartedAt = 0;
    this.timer = null;
  }

  get playerList() {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      ready: p.ready,
      connected: p.ws.readyState === p.ws.OPEN,
    }));
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const p of this.players.values()) {
      if (p.ws.readyState === p.ws.OPEN) p.ws.send(payload);
    }
  }

  send(playerId, message) {
    const p = this.players.get(playerId);
    if (p && p.ws.readyState === p.ws.OPEN) p.ws.send(JSON.stringify(message));
  }

  addPlayer(id, ws, name) {
    this.players.set(id, { id, ws, name, score: 0, ready: false, answeredIndex: null, answeredAt: null });
    this.broadcastPlayerList();
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.players.size === 0) {
      this.clearTimer();
      this.onEmpty(this.code);
      return;
    }
    this.broadcastPlayerList();
    if (this.state === 'question') this.maybeAdvanceEarly();
  }

  broadcastPlayerList() {
    this.broadcast({ type: 'players', players: this.playerList, state: this.state });
  }

  setReady(id, ready) {
    const p = this.players.get(id);
    if (!p) return;
    p.ready = ready;
    this.broadcastPlayerList();
    if (this.state === 'lobby' && this.players.size >= MIN_PLAYERS_TO_START && [...this.players.values()].every((pl) => pl.ready)) {
      this.startCountdown();
    }
  }

  clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  startCountdown() {
    this.state = 'countdown';
    this.questions = shuffled(ALL_QUESTIONS).slice(0, QUESTIONS_PER_GAME);
    this.questionIndex = -1;
    for (const p of this.players.values()) p.score = 0;
    this.broadcast({ type: 'countdown', seconds: Math.round(COUNTDOWN_MS / 1000) });
    this.clearTimer();
    this.timer = setTimeout(() => this.nextQuestion(), COUNTDOWN_MS);
  }

  nextQuestion() {
    this.questionIndex += 1;
    if (this.questionIndex >= this.questions.length) {
      this.endGame();
      return;
    }
    this.state = 'question';
    this.questionStartedAt = Date.now();
    for (const p of this.players.values()) {
      p.answeredIndex = null;
      p.answeredAt = null;
    }
    const q = this.questions[this.questionIndex];
    this.broadcast({
      type: 'question',
      index: this.questionIndex,
      total: this.questions.length,
      category: q.category,
      text: q.text,
      choices: q.choices,
      timeLimitMs: QUESTION_TIME_MS,
    });
    this.clearTimer();
    this.timer = setTimeout(() => this.revealAnswer(), QUESTION_TIME_MS);
  }

  submitAnswer(id, choiceIndex) {
    if (this.state !== 'question') return;
    const p = this.players.get(id);
    const question = this.questions[this.questionIndex];
    const now = Date.now();
    if (!p || p.answeredIndex !== null || !Number.isInteger(choiceIndex)
      || choiceIndex < 0 || choiceIndex >= question.choices.length
      || now - this.questionStartedAt >= QUESTION_TIME_MS) return;
    p.answeredIndex = choiceIndex;
    p.answeredAt = now;
    this.maybeAdvanceEarly();
  }

  maybeAdvanceEarly() {
    if (this.state !== 'question') return;
    const allAnswered = [...this.players.values()].every((p) => p.answeredIndex !== null);
    if (allAnswered && this.players.size > 0) {
      this.clearTimer();
      this.revealAnswer();
    }
  }

  revealAnswer() {
    if (this.state !== 'question') return;
    this.state = 'reveal';
    const q = this.questions[this.questionIndex];
    for (const p of this.players.values()) {
      const correct = p.answeredIndex === q.correctIndex;
      let pointsEarned = 0;
      if (correct) {
        const elapsed = (p.answeredAt ?? this.questionStartedAt + QUESTION_TIME_MS) - this.questionStartedAt;
        const remainingFrac = Math.max(0, 1 - elapsed / QUESTION_TIME_MS);
        pointsEarned = Math.max(100, Math.round(1000 * remainingFrac));
      }
      p.score += pointsEarned;
      p.lastCorrect = correct;
      p.lastPointsEarned = pointsEarned;
    }
    this.broadcast({
      type: 'reveal',
      correctIndex: q.correctIndex,
      scoreboard: [...this.players.values()]
        .map((p) => ({ id: p.id, name: p.name, score: p.score, correct: p.lastCorrect, pointsEarned: p.lastPointsEarned }))
        .sort((a, b) => b.score - a.score),
    });
    this.clearTimer();
    this.timer = setTimeout(() => this.nextQuestion(), REVEAL_TIME_MS);
  }

  endGame() {
    this.state = 'gameover';
    const finalScoreboard = [...this.players.values()]
      .map((p) => ({ id: p.id, name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score);
    this.broadcast({ type: 'gameover', scoreboard: finalScoreboard });
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.state = 'lobby';
      for (const p of this.players.values()) p.ready = false;
      this.broadcastPlayerList();
    }, 8000);
  }
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  getOrCreate(code) {
    let room = this.rooms.get(code);
    if (!room) {
      room = new Room(code, (c) => this.rooms.delete(c));
      this.rooms.set(code, room);
    }
    return room;
  }
}
