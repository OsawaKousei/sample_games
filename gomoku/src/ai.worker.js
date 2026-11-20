import { chooseMove } from './ai.js';
self.onmessage = ({ data }) => {
  try {
    const result = chooseMove(data.board, data.difficulty, {
      onProgress: progress => self.postMessage({ type: 'progress', ...progress }),
    });
    self.postMessage({ type: 'done', ...result });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
