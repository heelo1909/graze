// Entry point. ?nettest runs the connection check page instead of the game;
// the game module is only loaded otherwise, so nothing of it (Renderer, Input,
// Audio) is created in nettest mode.
import { runNetTest } from './net/nettest';
import { peerTransport } from './net/peer';

if (new URLSearchParams(location.search).has('nettest')) {
  runNetTest(document.getElementById('ui')!, peerTransport());
} else {
  void import('./game');
}
