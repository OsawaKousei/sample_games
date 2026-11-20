// Run in one process so the suite also works in restricted child-process sandboxes.
import './gomoku/src/ai.test.js';
import './gomoku/src/hard-ai.test.js';
import './gomoku/src/opening-book.test.js';
import './shooter/src/model.test.js';
import './survivor/src/model.test.js';
