import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { apiUrl } from '../lib/api';
import './WordlePage.css';

const ROWS = 6;
const COLS = 5;

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE']
];

const WordleIcons = {
  game: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 12h4" /><path d="M8 10v4" /><circle cx="15" cy="13" r="1" /><circle cx="18" cy="11" r="1" /></svg>,
  streak: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.457-5 2.5-6 1.107 1.476 1.34 2.84 1 4.5 1.5-1 2.5-2.5 2.5-2.5 1.125 1.875 1.875 5.625-1.5 9.75a7 7 0 1 1-6 0z" /></svg>,
};

function getAuthHeaders() {
  const token = localStorage.getItem('academia_token');
  let student = {};
  try {
    const raw = localStorage.getItem('academia_student');
    if (raw) student = JSON.parse(raw);
  } catch (e) {}
  
  return {
    'Authorization': `Bearer ${token}`,
    'X-User-NetID': student.regNumber || 'unknown',
    'X-User-Name': student.name || 'Anonymous'
  };
}

export default function WordlePage() {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [word, setWord] = useState('');
  const [guesses, setGuesses] = useState(Array(ROWS).fill(null).map(() => ''));
  const [currentRow, setCurrentRow] = useState(0);
  
  const [gameState, setGameState] = useState('loading'); // 'loading', 'playing', 'won', 'lost', 'already_played'
  const [message, setMessage] = useState('');
  
  const [userStats, setUserStats] = useState({ score: 0, streak: 0 });
  const [leaderboard, setLeaderboard] = useState([]);
  const [weeklyWinners, setWeeklyWinners] = useState([]);
  const [weekKey, setWeekKey] = useState('');
  const [lastWeekKey, setLastWeekKey] = useState('');
  
  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2500);
  };

  const fetchLeaderboard = async () => {
    try {
      const headers = getAuthHeaders();
      const [lbRes, winnersRes] = await Promise.all([
        fetch(apiUrl('/wordle/leaderboard'), { headers }),
        fetch(apiUrl('/wordle/weekly-winners'), { headers })
      ]);

      if (lbRes.ok) {
        const data = await lbRes.json();
        setLeaderboard(data.leaderboard || []);
        setWeekKey(data.weekKey || '');
      }

      if (winnersRes.ok) {
        const data = await winnersRes.json();
        setWeeklyWinners(data.winners || []);
        setLastWeekKey(data.weekKey || '');
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard or winners', err);
    }
  };

  const initGame = async () => {
    try {
      setGameState('loading');
      
      const headers = getAuthHeaders();
      if (!headers['Authorization']) return;

      // Check state
      const stateRes = await fetch(apiUrl('/wordle/state'), { headers });
      const stateData = await stateRes.json();
      
      setUserStats({ score: stateData.score || 0, streak: stateData.streak || 0 });

      if (stateData.playedToday) {
        setGameState('already_played');
        fetchLeaderboard();
        return;
      }

      // Fetch Word
      const wordRes = await fetch(apiUrl('/wordle/daily-word'), { headers });
      const wordData = await wordRes.json();
      
      if (wordData.word && wordData.word.trim().length === 5) {
        const currentWord = wordData.word.trim().toUpperCase();
        setWord(currentWord);

        // Load local state
        const savedState = JSON.parse(localStorage.getItem('wordle_local_state') || 'null');
        if (savedState && savedState.word === currentWord) {
          setGuesses(savedState.guesses);
          setCurrentRow(savedState.currentRow);
          setGameState(savedState.gameState);
        } else {
          setGuesses(Array(ROWS).fill(null).map(() => ''));
          setCurrentRow(0);
          setGameState('playing');
        }
        fetchLeaderboard();
      } else {
        // Fallback for safety if backend somehow returns an invalid word
        showMessage('Invalid daily word received. Retrying...');
        setGameState('loading');
        setTimeout(initGame, 1000);
      }

    } catch (err) {
      showMessage('Failed to connect to game server');
    }
  };

  useEffect(() => {
    initGame();
  }, []);

  useEffect(() => {
    if (word && (gameState === 'playing' || gameState === 'won' || gameState === 'lost')) {
      localStorage.setItem('wordle_local_state', JSON.stringify({
        word,
        guesses,
        currentRow,
        gameState
      }));
    }
  }, [word, guesses, currentRow, gameState]);

  const submitScore = async (won, attempts) => {
    const pointsMap = { 1: 100, 2: 80, 3: 60, 4: 40, 5: 20, 6: 10 };
    const pointsWon = won ? (pointsMap[attempts] || 0) : 0;
    try {
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
      const res = await fetch(apiUrl('/wordle/submit'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ won, pointsWon })
      });
      if (res.ok) {
        const data = await res.json();
        setUserStats({ score: data.score, streak: data.streak });
        fetchLeaderboard();
        if (won) {
          showMessage(`Genius! You earned ${pointsWon} points`);
        }
      }
    } catch (err) {
      console.error('Failed to submit score');
    }
  };

  const handleChar = useCallback((char) => {
    if (gameState !== 'playing') return;
    setGuesses((prev) => {
      const newGuesses = [...prev];
      if (newGuesses[currentRow].length < COLS) {
        newGuesses[currentRow] += char;
      }
      return newGuesses;
    });
  }, [currentRow, gameState]);

  const handleDelete = useCallback(() => {
    if (gameState !== 'playing') return;
    setGuesses((prev) => {
      const newGuesses = [...prev];
      newGuesses[currentRow] = newGuesses[currentRow].slice(0, -1);
      return newGuesses;
    });
  }, [currentRow, gameState]);

  const handleEnter = useCallback(() => {
    if (gameState !== 'playing') return;
    
    const currentGuess = guesses[currentRow];
    if (currentGuess.length < COLS) {
      showMessage('Not enough letters');
      return;
    }

    if (currentGuess === word) {
      setGameState('won');
      submitScore(true, currentRow + 1);
    } else if (currentRow === ROWS - 1) {
      setGameState('lost');
      showMessage(`The word was ${word}`);
      submitScore(false, ROWS);
    }
    
    setCurrentRow((prev) => prev + 1);
  }, [currentRow, gameState, guesses, word]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showHowToPlay) {
        setShowHowToPlay(false);
        return;
      }

      if (showHowToPlay) return;

      if (e.key === 'Enter') {
        handleEnter();
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        handleChar(e.key.toUpperCase());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleChar, handleDelete, handleEnter, showHowToPlay]);

  const getRowStates = (guess, target) => {
    if (!guess || !target || guess.length !== target.length) {
      return Array(COLS).fill('empty');
    }

    const states = Array(COLS).fill('absent');
    const targetLetters = target.split('');
    const remainingLetters = {};

    // First pass: Find all correct letters
    targetLetters.forEach((letter) => {
      remainingLetters[letter] = (remainingLetters[letter] || 0) + 1;
    });

    guess.split('').forEach((letter, i) => {
      if (letter === target[i]) {
        states[i] = 'correct';
        remainingLetters[letter]--;
      }
    });

    // Second pass: Find all present letters
    guess.split('').forEach((letter, i) => {
      if (states[i] !== 'correct' && remainingLetters[letter] > 0) {
        if (target.includes(letter)) {
          states[i] = 'present';
          remainingLetters[letter]--;
        }
      }
    });

    return states;
  };

  const getLetterState = (rowIdx, colIdx) => {
    if (rowIdx >= currentRow) return 'empty';
    const guess = guesses[rowIdx];
    if (!guess) return 'empty';
    
    // We pre-calculate states for the entire row to handle duplicates correctly
    const rowStates = getRowStates(guess, word);
    return rowStates[colIdx];
  };

  const usedLetters = {};
  guesses.slice(0, currentRow).forEach((guess) => {
    guess.split('').forEach((letter, i) => {
      const state = getLetterState(guesses.indexOf(guess), i);
      if (state === 'correct') {
        usedLetters[letter] = 'correct';
      } else if (state === 'present' && usedLetters[letter] !== 'correct') {
        usedLetters[letter] = 'present';
      } else if (!usedLetters[letter]) {
        usedLetters[letter] = 'absent';
      }
    });
  });

  return (
    <div className="wordle-page-wrapper animate-fade-in">
      {showHowToPlay && createPortal(
        <div className="apple-modal-overlay wordle-howto-overlay" onClick={() => setShowHowToPlay(false)}>
          <div
            className="apple-modal-card compact wordle-howto-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="How to play Wordle"
          >
            <header className="apple-modal-header">
              <div className="warning-icon-wrap" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                {WordleIcons.game}
              </div>
              <h2>How to Play</h2>
              <button
                type="button"
                className="apple-modal-close"
                onClick={() => setShowHowToPlay(false)}
                aria-label="Close instructions"
              >
                ×
              </button>
            </header>

            <div className="apple-modal-body">
              <p className="primary-text">Guess the 5-letter daily word in 6 tries.</p>
              <ul className="apple-bullet-list wordle-howto-list">
                <li><span>Type letters using keyboard or tap the on-screen keys.</span></li>
                <li><span>Press <strong>Enter</strong> to submit your guess.</span></li>
                <li><span><strong>Green</strong> means correct letter and correct position.</span></li>
                <li><span><strong>Yellow</strong> means the letter exists but in a different position.</span></li>
                <li><span><strong>Gray</strong> means the letter is not in the word.</span></li>
                <li><span>You can play once per day and faster wins score higher.</span></li>
              </ul>
            </div>

            <footer className="apple-modal-footer">
              <button type="button" className="apple-btn primary" onClick={() => setShowHowToPlay(false)}>
                Got it
              </button>
            </footer>
          </div>
        </div>,
        document.body
      )}

      <div className="wordle-header-top">
        <div className="wordle-banner">
          <div className="wordle-banner-icon">{WordleIcons.game}</div>
          <div className="wordle-banner-text">
            <h2>NEXUS Wordle</h2>
            <p>Daily Challenge</p>
          </div>
        </div>
        
        <div className="wordle-stats-bar">
          <button
            type="button"
            className="wordle-howto-btn"
            onClick={() => setShowHowToPlay(true)}
          >
            How to Play
          </button>
          <div className="wordle-stat-box">
            <span className="stat-label">Total Score</span>
            <span className="stat-value">{userStats.score}</span>
          </div>
          <div className="wordle-stat-box">
            <span className="stat-label">Streak</span>
            <span className="stat-value streak-val">
              {WordleIcons.streak} {userStats.streak}
            </span>
          </div>
        </div>
      </div>

      <div className="wordle-main-split">
        <div className="wordle-game-area">
          {message && <div className="wordle-message">{message}</div>}

          {gameState === 'loading' ? (
            <div className="wordle-loading">
              <div className="spinner"></div>
              <p>Fetching today's word...</p>
            </div>
          ) : gameState === 'already_played' ? (
            <div className="wordle-done-state">
              <h3>You've played today!</h3>
              <p>Come back tomorrow for the next challenge.</p>
              <div className="huge-score">{userStats.score} pts</div>
            </div>
          ) : (
            <>
              <div className="wordle-grid">
                {guesses.map((guess, rowIdx) => (
                  <div key={rowIdx} className="wordle-row">
                    {Array(COLS).fill(0).map((_, colIdx) => {
                      const letter = guess[colIdx] || '';
                      const state = getLetterState(rowIdx, colIdx);
                      const isActive = rowIdx === currentRow && letter;
                      return (
                        <div 
                          key={colIdx} 
                          className={`wordle-cell ${state !== 'empty' ? `state-${state}` : ''} ${isActive ? 'active-cell' : ''}`}
                        >
                          {letter}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="wordle-keyboard">
                {KEYBOARD_ROWS.map((row, rowIdx) => (
                  <div key={rowIdx} className="wordle-keyboard-row">
                    {row.map((key) => {
                      const state = usedLetters[key];
                      return (
                        <button
                          key={key}
                          className={`wordle-key ${key === 'ENTER' || key === 'BACKSPACE' ? 'func-key' : ''} ${state ? `state-${state}` : ''}`}
                          onClick={() => {
                            if (key === 'ENTER') handleEnter();
                            else if (key === 'BACKSPACE') handleDelete();
                            else handleChar(key);
                          }}
                        >
                          {key === 'BACKSPACE' ? '⌫' : key}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}

          {(gameState === 'won' || gameState === 'lost') && (
            <div className="wordle-post-game">
              <h3>{gameState === 'won' ? 'Brilliant!' : 'Nice try!'}</h3>
              <p>You can only play once per day.</p>
            </div>
          )}
        </div>

        <div className="wordle-leaderboard-side">
          <div className="lb-section">
            <div className="lb-header">
              <h3>Leaderboard</h3>
              <span className="lb-badge">Top 10</span>
            </div>
            <div className="lb-list">
              {leaderboard.length === 0 ? (
                <div className="lb-empty">No scores yet. Be the first!</div>
              ) : (
                leaderboard.map((lb, idx) => (
                  <div key={idx} className={`lb-item ${idx < 3 ? `top-${idx+1}` : ''}`}>
                    <div className="lb-rank">
                      {idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                    </div>
                    <div className="lb-info">
                      <span className="lb-name">{lb.name}</span>
                    </div>
                    <div className="lb-score">
                      {lb.streak > 0 && <span className="lb-streak-box">{WordleIcons.streak} {lb.streak}</span>}
                      {' '}{lb.points} pts
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {weeklyWinners.length > 0 && (
            <div className="lb-section winners-section animate-slide-up">
              <div className="lb-header">
                <h3>Last Week's Champions</h3>
                <span className="lb-badge gold">Hall of Fame</span>
              </div>
              <div className="lb-list winners-list">
                {weeklyWinners.map((lb, idx) => (
                  <div key={idx} className={`lb-item winner-rank-${idx+1}`}>
                    <div className="lb-rank">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</div>
                    <div className="lb-info">
                      <span className="lb-name">{lb.name}</span>
                    </div>
                    <div className="lb-score">{lb.points} pts</div>
                  </div>
                ))}
              </div>
              <div className="lb-footer-info">Finished on {lastWeekKey}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
