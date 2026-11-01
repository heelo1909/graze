// Entry point. ?nettest runs the connection check page instead of the game;
// the game module is only loaded otherwise, so nothing of it (Renderer, Input,
// Audio) is created in nettest mode.
import { runNetTest } from './net/nettest';
import { peerTransport } from './net/peer';

if (new URLSearchParams(location.search).has('nettest')) {
  runNetTest(document.getElementById('ui')!, peerTransport());
} else {
  import('./game').catch(() => {
    // A stale cached index.html after a redeploy points at chunks that no longer exist.
    const ui = document.getElementById('ui')!;
    const box = document.createElement('div');
    box.className = 'screen';
    const msg = document.createElement('p');
    msg.className = 'pitch';
    msg.textContent = 'Reload the page';
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.textContent = 'Reload';
    btn.addEventListener('click', () => location.reload());
    box.append(msg, btn);
    ui.replaceChildren(box);
  });
}
