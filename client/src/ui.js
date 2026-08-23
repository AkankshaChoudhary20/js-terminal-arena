import blessed from 'blessed';

export function buildUi() {
  const screen = blessed.screen({ smartCSR: true, title: 'Terminal Arena' });

  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    content: '{center}Terminal Arena{/center}',
  });

  const questionBox = blessed.box({
    top: 3,
    left: 0,
    width: '70%',
    height: '60%-3',
    tags: true,
    border: { type: 'line' },
    label: ' Question ',
    style: { border: { fg: 'blue' } },
    padding: { left: 1, right: 1, top: 1 },
  });

  const leaderboard = blessed.list({
    top: 3,
    left: '70%',
    width: '30%',
    height: '60%-3',
    tags: true,
    border: { type: 'line' },
    label: ' Leaderboard ',
    style: { border: { fg: 'yellow' }, selected: { bg: 'default' } },
  });

  const log = blessed.log({
    top: '60%',
    left: 0,
    width: '100%',
    height: '40%-3',
    tags: true,
    border: { type: 'line' },
    label: ' Activity ',
    style: { border: { fg: 'green' } },
    scrollback: 200,
  });

  const footer = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'magenta' } },
    content: '{center}[1-4] Answer   [r] Ready   [q] Quit{/center}',
  });

  screen.append(header);
  screen.append(questionBox);
  screen.append(leaderboard);
  screen.append(log);
  screen.append(footer);

  screen.key(['q', 'C-c'], () => process.exit(0));

  return { screen, header, questionBox, leaderboard, log, footer };
}

export function renderLeaderboard(leaderboard, players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  leaderboard.setItems(
    sorted.map((p, i) => {
      const readyTag = p.ready ? '{green-fg}●{/green-fg}' : '{grey-fg}○{/grey-fg}';
      const connTag = p.connected === false ? '{red-fg}(off){/red-fg}' : '';
      return `${readyTag} ${i + 1}. ${p.name} — ${p.score} ${connTag}`;
    }),
  );
}
