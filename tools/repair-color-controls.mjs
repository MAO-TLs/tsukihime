import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// The v2 exporter retained source color markers in English prose AND projected
// copies of those markers into the middle of the translated sentence. Relocate
// each witnessed command to the retained marker; preserve command topology.
// Never touch colors in graphics commands, or infer a color from English words.
export function repairColorControls(source, converted = false) {
  const colorCommand = converted ? 'textcolor ' : '';
  const command = converted ? /^textcolor (#[\da-f]{6})$/i : /^(#[\da-f]{6})$/i;
  function repairGroup(lines) {
    const markers = [], commands = [];
    lines.forEach((line, index) => {
      if (line.startsWith('`')) {
        for (const match of line.matchAll(/#[\da-f]{6}/ig))
          markers.push({index, color: match[0].toLowerCase()});
      } else {
        const match = line.match(command);
        if (match) commands.push({index, color: match[1].toLowerCase()});
      }
    });
    if (!markers.length) return lines;
    // Ordered, nearest matching assignment. Every literal marker must be
    // witnessed by an actual source command within this same text-only run.
    // Keep unpaired legitimate commands, including repeated colors.
    const memo = new Map();
    function align(m, c) {
      if (m === markers.length) return {cost: 0, picks: []};
      if (c === commands.length) return {cost: Infinity, picks: []};
      const key = m + ':' + c;
      if (memo.has(key)) return memo.get(key);
      let best = align(m, c + 1);
      if (markers[m].color === commands[c].color) {
        const tail = align(m + 1, c + 1);
        const cost = Math.abs(markers[m].index - commands[c].index) + tail.cost;
        if (cost < best.cost) best = {cost, picks: [commands[c].index, ...tail.picks]};
      }
      memo.set(key, best);
      return best;
    }
    const aligned = align(0, 0);
    if (!Number.isFinite(aligned.cost)) throw Error('Unwitnessed English color marker: ' + lines.join('\n'));
    const removed = new Set(aligned.picks), out = [];
    let removedColor = false;
    lines.forEach((line, index) => {
      if (removed.has(index)) { removedColor = true; return; }
      if (line.startsWith('`') && /#[\da-f]{6}/i.test(line)) {
        const parts = line.slice(1).split(/(#[\da-f]{6})/i);
        for (let i = 0; i < parts.length; i++) {
          if (i % 2) out.push(colorCommand + parts[i].toLowerCase());
          else if (parts[i]) out.push('`' + parts[i]);
        }
      } else if (removedColor && line.startsWith('` ') && out.at(-1)?.startsWith('`')
          && !out.at(-1).endsWith('@')) out[out.length - 1] += line.slice(1);
      else out.push(line);
      removedColor = false;
    });
    const colors = values => values.map(x => x.match(command)?.[1]?.toLowerCase()).filter(Boolean);
    if (JSON.stringify(colors(out)) !== JSON.stringify(colors(lines))) throw Error('Color command order changed');
    return out;
  }
  const out = [], group = [];
  for (const line of source.split('\n')) {
    if (line.startsWith('`') || command.test(line)) group.push(line);
    else { out.push(...repairGroup(group), line); group.length = 0; }
  }
  out.push(...repairGroup(group));
  return out.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = new URL('../public/static/en-mao/', import.meta.url);
  const targets = [new URL('fullscript_en-mao.txt', root),
    ...fs.readdirSync(new URL('scenes/', root)).filter(x => x.endsWith('.txt'))
      .map(x => new URL('scenes/' + x, root))];
  let changed = 0;
  for (const file of targets) {
    const before = fs.readFileSync(file, 'utf8');
    const after = repairColorControls(before, file.pathname.includes('/scenes/'));
    if (before !== after) { fs.writeFileSync(file, after); changed++; }
  }
  console.log(JSON.stringify({changedFiles: changed}));
}
