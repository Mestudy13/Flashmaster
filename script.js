
/* =========================================================
   FLASHMASTER — Main JavaScript
   English interface, persistent data, spaced repetition
   ========================================================= */

/* -------------------- Data & Storage -------------------- */

function loadAppData() {
  try {
    const saved = JSON.parse(localStorage.getItem('appData'));
    if (saved && Array.isArray(saved.folders)) {
      return saved;
    }
  } catch (error) {
    console.error('Could not read FlashMaster data:', error);
  }

  return { folders: [] };
}

let appData = loadAppData();

function saveData() {
  try {
    localStorage.setItem('appData', JSON.stringify(appData));
  } catch (error) {
    console.error('Could not save FlashMaster data:', error);
    alert('Your data could not be saved. Check your browser storage.');
  }
}

// Study history is stored separately so existing appData and old backups remain compatible.
const STUDY_HISTORY_KEY = 'flashmasterStudyHistory';

function loadStudyHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(STUDY_HISTORY_KEY) || '[]');
    return Array.isArray(history) ? history : [];
  } catch (error) {
    console.warn('Could not read FlashMaster study history:', error);
    return [];
  }
}

function recordStudyReview(deck, card, difficulty) {
  const history = loadStudyHistory();
  history.push({
    timestamp: Date.now(),
    deckId: deck.id,
    deckName: deck.name,
    cardId: card.id,
    difficulty
  });
  // Keep the most recent 5,000 review events to prevent unlimited storage growth.
  try {
    localStorage.setItem(STUDY_HISTORY_KEY, JSON.stringify(history.slice(-5000)));
  } catch (error) {
    console.warn('Could not save FlashMaster study history:', error);
  }
}

function startOfTodayTimestamp() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function $(id) {
  return document.getElementById(id);
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '');
}

function shuffleArray(array) {
  const shuffled = array.slice();

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/* -------------------- Spaced Repetition -------------------- */

// Keep these Portuguese values internally for compatibility
// with your existing saved cards.
function difficultyToQuality(difficulty) {
  switch (difficulty) {
    case 'errou': return 0;
    case 'difícil': return 3;
    case 'médio': return 4;
    case 'fácil': return 5;
    default: return 0;
  }
}

const DIFFICULTY_LABELS = {
  'fácil': 'Easy',
  'médio': 'Medium',
  'difícil': 'Hard',
  'errou': "Didn't know"
};

function getDifficultyLabel(value) {
  return DIFFICULTY_LABELS[value] || value || 'Not reviewed';
}

/* -------------------- Random Mode -------------------- */

let randomMode = localStorage.getItem('randomMode') === 'true';

function updateRandomModeButton() {
  const button = $('randomMode');
  if (!button) return;

  button.classList.toggle('active', randomMode);
  button.setAttribute('aria-pressed', String(randomMode));
  button.textContent = randomMode
    ? '⇄ Random order: On'
    : '⇄ Random order: Off';
}

function toggleRandomMode() {
  randomMode = !randomMode;
  localStorage.setItem('randomMode', String(randomMode));

  updateRandomModeButton();
  renderDeckList();
  renderTodayReview();
}

/* -------------------- Folder & Deck Helpers -------------------- */

function findDeckById(deckId) {
  function search(folders) {
    for (const folder of folders) {
      const deck = folder.decks.find(item => item.id === deckId);
      if (deck) return deck;

      const nested = search(folder.subfolders);
      if (nested) return nested;
    }

    return null;
  }

  return search(appData.folders);
}

function findFolderById(folders, folderId) {
  for (const folder of folders) {
    if (folder.id === folderId) return folder;

    const nested = findFolderById(folder.subfolders, folderId);
    if (nested) return nested;
  }

  return null;
}

function getDeckPath(folders, deckId, path = '') {
  for (const folder of folders) {
    const currentPath = path
      ? `${path} > ${folder.name}`
      : folder.name;

    for (const deck of folder.decks) {
      if (deck.id === deckId) {
        return `${currentPath} > ${deck.name}`;
      }
    }

    const nested = getDeckPath(
      folder.subfolders,
      deckId,
      currentPath
    );

    if (nested !== 'Unknown') return nested;
  }

  return 'Unknown';
}

function getAllDecks(folders, result = []) {
  folders.forEach(folder => {
    folder.decks.forEach(deck => {
      result.push({ deck, folderId: folder.id });
    });

    getAllDecks(folder.subfolders, result);
  });

  return result;
}

function isCardDue(card) {
  return Number(card.nextReview) <= Date.now();
}

function getFlashcardClass(card) {
  return isCardDue(card) ? 'flashcard-due' : 'flashcard-ok';
}

function countDueFlashcards(cards) {
  return cards.reduce(
    (count, card) => count + (isCardDue(card) ? 1 : 0),
    0
  );
}

function visitAllCards(callback) {
  function visit(folders) {
    folders.forEach(folder => {
      folder.decks.forEach(deck => {
        deck.flashcards.forEach(card => callback(card, deck, folder));
      });

      visit(folder.subfolders);
    });
  }

  visit(appData.folders);
}

/* -------------------- Section Navigation -------------------- */

function showSection(sectionId) {
  const sectionIds = [
    'reviewDecksSection',
    'todayReviewSection',
    'addFlashcardSection',
    'manageSection',
    'difficultySection',
    'statsSection',
    'deckFlashcardsSection'
  ];

  sectionIds.forEach(id => {
    const section = $(id);
    if (!section) return;

    section.classList.add('hidden');
    section.classList.remove('show');
  });

  const target = $(sectionId);

  if (target) {
    target.classList.remove('hidden');
    void target.offsetWidth;
    target.classList.add('show');
  }

  switch (sectionId) {
    case 'reviewDecksSection':
      renderDeckList();
      break;
    case 'todayReviewSection':
      renderTodayReview();
      break;
    case 'manageSection':
      renderFolderTree();
      break;
    case 'difficultySection':
      renderDifficultyZones();
      break;
    case 'statsSection':
      renderStatsContent();
      break;
  }
}

/* -------------------- Statistics -------------------- */

function getStatistics() {
  const stats = {
    total: 0,
    due: 0,
    overdue: 0,
    reviewedToday: 0,
    favorites: 0,
    decks: 0,
    folders: 0,
    decksProgress: []
  };
  const todayStart = startOfTodayTimestamp();
  const history = loadStudyHistory();
  const reviewsTodayByDeck = new Map();

  history.forEach(event => {
    if (Number(event.timestamp) >= todayStart) {
      stats.reviewedToday++;
      reviewsTodayByDeck.set(
        event.deckId,
        (reviewsTodayByDeck.get(event.deckId) || 0) + 1
      );
    }
  });

  function count(folders) {
    folders.forEach(folder => {
      stats.folders++;

      folder.decks.forEach(deck => {
        stats.decks++;
        stats.total += deck.flashcards.length;
        let deckDue = 0;
        let deckOverdue = 0;

        deck.flashcards.forEach(card => {
          if (isCardDue(card)) {
            stats.due++;
            deckDue++;
            if (Number(card.nextReview) < todayStart) {
              stats.overdue++;
              deckOverdue++;
            }
          }
          if (card.favorite) stats.favorites++;
        });

        stats.decksProgress.push({
          id: deck.id,
          name: deck.name,
          folderPath: getDeckPath(appData.folders, deck.id),
          total: deck.flashcards.length,
          due: deckDue,
          overdue: deckOverdue,
          reviewedToday: reviewsTodayByDeck.get(deck.id) || 0
        });
      });

      count(folder.subfolders);
    });
  }

  count(appData.folders);
  stats.decksProgress.sort((a, b) =>
    b.due - a.due || b.reviewedToday - a.reviewedToday || a.name.localeCompare(b.name)
  );
  return stats;
}

function renderStatsContent() {
  const container = $('stats');
  if (!container) return;

  const stats = getStatistics();
  const progressRows = stats.decksProgress.length
    ? stats.decksProgress.map(deck => {
        const reviewedPercent = deck.total ? Math.min(100, Math.round((deck.reviewedToday / deck.total) * 100)) : 0;
        return `
          <div class="deck-progress-row">
            <div class="deck-progress-heading">
              <div class="deck-progress-title">
                <strong>${escapeHTML(deck.name)}</strong>
                <span>${escapeHTML(deck.folderPath)}</span>
              </div>
              <div class="deck-progress-counts">
                <span>${deck.reviewedToday} reviewed today</span>
                <span>${deck.due} due${deck.overdue ? ` · ${deck.overdue} overdue` : ''}</span>
              </div>
            </div>
            <div class="deck-progress-track" role="progressbar" aria-label="${escapeHTML(deck.name)} cards reviewed today" aria-valuemin="0" aria-valuemax="${Math.max(deck.total, 1)}" aria-valuenow="${Math.min(deck.reviewedToday, deck.total)}">
              <span style="width:${reviewedPercent}%"></span>
            </div>
            <small>${deck.total} total card${deck.total === 1 ? '' : 's'}</small>
          </div>
        `;
      }).join('')
    : '<p class="stats-empty">Create a folder and deck to see your revision progress here.</p>';

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><span class="stat-value">${stats.reviewedToday}</span><span class="stat-label">Reviewed today</span></div>
      <div class="stat-card"><span class="stat-value">${stats.due}</span><span class="stat-label">Due now</span></div>
      <div class="stat-card"><span class="stat-value">${stats.overdue}</span><span class="stat-label">Overdue</span></div>
      <div class="stat-card"><span class="stat-value">${stats.total}</span><span class="stat-label">Total flashcards</span></div>
      <div class="stat-card"><span class="stat-value">${stats.favorites}</span><span class="stat-label">Favourites</span></div>
      <div class="stat-card"><span class="stat-value">${stats.decks}</span><span class="stat-label">Decks</span></div>
      <div class="stat-card"><span class="stat-value">${stats.folders}</span><span class="stat-label">Folders</span></div>
    </div>
    <section class="deck-progress-section">
      <div class="deck-progress-section-heading">
        <div><h3>Progress by deck</h3><p>See what you've reviewed today and which decks need attention.</p></div>
        <span class="deck-progress-date">${escapeHTML(new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))}</span>
      </div>
      ${progressRows}
      <p class="stats-footnote">“Reviewed today” counts cards you've rated since installing this update. Older review activity isn't reconstructed, and your existing flashcards and schedules are unchanged.</p>
    </section>
  `;
}

function showStats() {
  showSection('statsSection');
}

/* -------------------- Flashcard Creation -------------------- */

function createFlashcard(
  question,
  answer,
  subject,
  deckId,
  imageData = '',
  audioData = '',
  answerMode = 'flip',
  cardType = 'basic',
  mcOptions = []
) {
  const deck = findDeckById(deckId);

  if (!deck) {
    alert('Please select a valid deck.');
    return;
  }

  const card = {
    id: generateId('card'),
    question,
    answer,
    subject,
    answerMode: cardType === 'written' || answerMode === 'write' ? 'write' : 'flip',
    cardType: cardType === 'multiple' ? 'multiple' : (cardType === 'written' ? 'written' : 'basic'),
    mcOptions: cardType === 'multiple' ? mcOptions.map(option => ({ text: String(option.text || '').trim(), correct: Boolean(option.correct) })).filter(option => option.text) : [],
    image: imageData || '',
    audio: audioData || '',
    interval: 1,
    nextReview: Date.now(),
    difficulty: null,
    favorite: false,
    easiness: 2.5,
    repetition: 0
  };

  deck.flashcards.push(card);
  saveData();

  renderDeckList();
  renderTodayReview();
}

/* -------------------- Flashcard Editing & Deletion -------------------- */

function deleteDeckFlashcard(deckId, cardId) {
  const deck = findDeckById(deckId);
  if (!deck) return;

  if (!confirm('Delete this flashcard? This cannot be undone.')) return;

  deck.flashcards = deck.flashcards.filter(card => card.id !== cardId);

  saveData();
  renderDeckFlashcards(deckId);
  renderDeckList();
  renderTodayReview();
  renderDifficultyZones();
  renderStatsContent();
}

function editDeckFlashcard(deckId, cardId) {
  const deck = findDeckById(deckId);
  const card = deck?.flashcards.find(item => item.id === cardId);

  if (!card) return;

  const question = prompt('Edit question:', card.question);
  if (question === null) return;

  const answer = prompt('Edit answer:', card.answer);
  if (answer === null) return;

  const subject = prompt('Edit subject:', card.subject);
  if (subject === null) return;

  if (!question.trim() || !answer.trim() || !subject.trim()) {
    alert('Question, answer and subject cannot be empty.');
    return;
  }

  card.question = question.trim();
  card.answer = answer.trim();
  card.subject = subject.trim();

  saveData();
  renderDeckFlashcards(deckId);
  renderTodayReview();
  renderDifficultyZones();
}

function toggleFavoriteDeckFlashcard(deckId, cardId) {
  const deck = findDeckById(deckId);
  const card = deck?.flashcards.find(item => item.id === cardId);

  if (!card) return;

  card.favorite = !card.favorite;

  saveData();
  renderDeckFlashcards(deckId);
  renderDeckList();
  renderTodayReview();
}

/* -------------------- SM-2 Review Scheduling -------------------- */

function updateDeckCard(deckId, cardId, correct, difficulty, options = {}) {
  const deck = findDeckById(deckId);
  const card = deck?.flashcards.find(item => item.id === cardId);

  if (!card) {
    alert('Flashcard not found.');
    return;
  }

  const quality = difficultyToQuality(difficulty);

  // Initialise missing scheduling fields on older cards.
  if (!Number.isFinite(card.easiness)) card.easiness = 2.5;
  if (!Number.isFinite(card.repetition)) card.repetition = 0;
  if (!Number.isFinite(card.interval)) card.interval = 1;

  if (quality < 3) {
    card.repetition = 0;
    card.interval = 1;
  } else {
    card.repetition++;

    if (card.repetition === 1) {
      card.interval = 1;
    } else if (card.repetition === 2) {
      card.interval = 6;
    } else {
      card.interval = Math.ceil(card.interval * card.easiness);
    }

    card.easiness = Math.max(
      1.3,
      card.easiness +
        (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    );
  }

  card.difficulty = difficulty;
  card.nextReview = Date.now() +
    card.interval * 24 * 60 * 60 * 1000;

  // Record only actual rating actions, not card edits or navigation.
  recordStudyReview(deck, card, difficulty);
  saveData();

  const nextDate = new Date(card.nextReview).toLocaleDateString();

  if (!options.silent) {
    alert(
      `Flashcard updated!\n\n` +
      `Next review in ${card.interval} day(s).\n` +
      `Date: ${nextDate}`
    );
  }

  if (!options.skipReviewRender) {
    renderDeckFlashcards(deckId);
    renderTodayReview();
  }
  renderDeckList();
  renderDifficultyZones();
  renderStatsContent();
}

/* -------------------- Single-card Review Interface -------------------- */

// Review state is kept in memory only. Flashcard data and scheduling remain
// in the existing appData/localStorage format.
let activeReview = null;
let selectedMixDeckIds = new Set();

function getReviewCardLabel(card, deck) {
  return card.subject || deck.name || 'Flashcard';
}

function getOrderedDeckCards(deck) {
  const cards = deck.flashcards.slice();
  if (randomMode) return shuffleArray(cards);

  // Put due/overdue cards first; future cards remain available after those.
  return cards.sort((a, b) => {
    const aDue = isCardDue(a) ? 0 : 1;
    const bDue = isCardDue(b) ? 0 : 1;
    return aDue - bDue || Number(a.nextReview) - Number(b.nextReview);
  });
}

function createReviewState(mode, entries, deckId = null) {
  activeReview = {
    mode,
    deckId,
    entries,
    index: 0,
    flipped: false,
    revealed: false,
    typedAnswer: '',
    selectedMCOptions: [],
    mcChecked: false
  };
}

function renderReviewInterface(container, mode) {
  if (!container || !activeReview || activeReview.mode !== mode) return;

  container.replaceChildren();
  const state = activeReview;
  const entries = state.entries;

  if (!entries.length) {
    container.innerHTML = `
      <div class="review-empty-state">
        <div class="review-empty-icon" aria-hidden="true">✓</div>
        <h3>${mode === 'today' ? 'You’re all caught up' : 'No flashcards yet'}</h3>
        <p>${mode === 'today'
          ? 'There are no cards due for review right now.'
          : 'Add some flashcards to this deck to start reviewing.'}</p>
      </div>`;
    return;
  }

  state.index = Math.max(0, Math.min(state.index, entries.length - 1));
  const entry = entries[state.index];
  const card = entry.card;
  const deck = entry.deck;
  if (!card || !deck) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'review-session';

  const top = document.createElement('div');
  top.className = 'review-session-top';
  top.innerHTML = `
    <span class="review-topic">${escapeHTML(getReviewCardLabel(card, deck))}</span>
    <div class="review-top-actions">
      <button type="button" class="review-shuffle-toggle" aria-pressed="${randomMode}">⇄ ${randomMode ? 'Shuffle: On' : 'Shuffle'}</button>
      <span class="review-progress">${state.index + 1} <span>/</span> ${entries.length}</span>
    </div>`;
  top.querySelector('.review-shuffle-toggle').addEventListener('click', () => {
    toggleRandomMode();
    if (activeReview?.mode === 'deck') renderDeckFlashcards(activeReview.deckId);
    else if (activeReview?.mode === 'today') renderTodayReview();
    else if (activeReview?.mode === 'mixed') {
      const currentId = activeReview.entries[activeReview.index]?.card.id;
      const entries = [];
      getAllDecks(appData.folders).forEach(({ deck }) => {
        if (activeReview.mixedDeckIds.includes(deck.id)) deck.flashcards.forEach(card => entries.push({ card, deck }));
      });
      activeReview.entries = randomMode ? shuffleArray(entries) : entries.sort((a, b) =>
        (isCardDue(a.card) ? 0 : 1) - (isCardDue(b.card) ? 0 : 1) || Number(a.card.nextReview) - Number(b.card.nextReview));
      const index = activeReview.entries.findIndex(item => item.card.id === currentId);
      activeReview.index = index >= 0 ? index : 0;
      renderCurrentReview();
    }
    else if (activeReview?.mode === 'zone') {
      const currentId = activeReview.entries[activeReview.index]?.card.id;
      activeReview.entries = getDifficultyZoneEntries(activeReview.zoneDifficulty);
      const index = activeReview.entries.findIndex(item => item.card.id === currentId);
      activeReview.index = index >= 0 ? index : 0;
      renderCurrentReview();
    }
  });
  wrapper.appendChild(top);

  const isMultipleChoice = card.cardType === 'multiple' && Array.isArray(card.mcOptions) && card.mcOptions.length > 0;
  const isWriteAnswer = !isMultipleChoice && (card.answerMode === 'write' || card.cardType === 'written');

  if (isMultipleChoice) {
    const options = card.mcOptions;
    if (!Array.isArray(state.selectedMCOptions)) state.selectedMCOptions = [];
    const correctIndices = options.map((option, index) => option.correct ? index : -1).filter(index => index >= 0);
    const selected = state.selectedMCOptions;
    const optionsMarkup = options.map((option, index) => {
      const chosen = selected.includes(index);
      const correct = Boolean(option.correct);
      const resultClass = state.mcChecked ? (correct ? ' is-correct' : (chosen ? ' is-incorrect' : '')) : '';
      return `<label class="review-mc-option${chosen ? ' is-selected' : ''}${resultClass}">
        <input type="checkbox" value="${index}" ${chosen ? 'checked' : ''} ${state.mcChecked ? 'disabled' : ''}>
        <span class="review-mc-option-text">${escapeHTML(option.text)}</span>
        ${state.mcChecked && correct ? '<span class="review-mc-result">Correct</span>' : ''}
        ${state.mcChecked && chosen && !correct ? '<span class="review-mc-result">Your choice</span>' : ''}
      </label>`;
    }).join('');
    const mcCard = document.createElement('div');
    mcCard.className = 'review-flip-card review-write-card review-mc-card';
    mcCard.innerHTML = `<div class="review-card-face review-card-front review-write-question">
      <span class="review-face-kicker">QUESTION · MULTIPLE CHOICE</span>
      <span class="review-card-main-text">${escapeHTML(card.question)}</span>
    </div>`;
    wrapper.appendChild(mcCard);

    const mcArea = document.createElement('section');
    mcArea.className = 'review-mc-area';
    mcArea.innerHTML = `<p class="review-mc-instruction">${state.mcChecked ? 'Correct answers are marked below.' : 'Select all answers you think are correct.'}</p>
      <div class="review-mc-options">${optionsMarkup}</div>
      ${state.mcChecked ? `<div class="review-write-correct-answer"><span class="review-face-kicker">CORRECT ANSWER${correctIndices.length === 1 ? '' : 'S'}</span><div class="review-card-main-text">${escapeHTML(correctIndices.map(index => options[index].text).join('; '))}</div></div>` : `<div class="review-write-actions"><button type="button" class="review-flip-button" data-check-mc>Check answer</button><button type="button" class="review-nav-button" data-dont-know-mc>I don't know</button></div>`}`;
    mcArea.querySelectorAll('input[type="checkbox"]').forEach(input => input.addEventListener('change', () => {
      const index = Number(input.value);
      if (input.checked && !state.selectedMCOptions.includes(index)) state.selectedMCOptions.push(index);
      if (!input.checked) state.selectedMCOptions = state.selectedMCOptions.filter(item => item !== index);
      renderCurrentReview();
    }));
    mcArea.querySelector('[data-check-mc]')?.addEventListener('click', () => {
      state.mcChecked = true;
      state.revealed = true;
      const selectedSorted = [...state.selectedMCOptions].sort((a, b) => a - b);
      const correctSorted = [...correctIndices].sort((a, b) => a - b);
      state.mcFullyCorrect = selectedSorted.length === correctSorted.length && selectedSorted.every((value, index) => value === correctSorted[index]);
      renderCurrentReview();
    });
    mcArea.querySelector('[data-dont-know-mc]')?.addEventListener('click', () => {
      state.selectedMCOptions = [];
      state.didNotKnow = true;
      state.mcChecked = true;
      state.revealed = true;
      state.mcFullyCorrect = false;
      renderCurrentReview();
    });
    wrapper.appendChild(mcArea);
  } else if (isWriteAnswer) {
    const writeCard = document.createElement('div');
    writeCard.className = 'review-flip-card review-write-card';
    writeCard.innerHTML = `
      <div class="review-card-face review-card-front review-write-question">
        <span class="review-face-kicker">QUESTION</span>
        <span class="review-card-main-text">${escapeHTML(card.question)}</span>
      </div>`;
    wrapper.appendChild(writeCard);

    const answerArea = document.createElement('section');
    answerArea.className = 'review-write-answer-area';

    if (!state.revealed) {
      answerArea.innerHTML = `
        <label class="review-write-label" for="reviewTypedAnswer">Your answer</label>
        <textarea id="reviewTypedAnswer" class="review-write-input" rows="3"
          placeholder="Type your answer here…"></textarea>
        <div class="review-write-actions">
          <button type="button" class="review-flip-button" data-check-answer>Check answer</button>
          <button type="button" class="review-nav-button" data-dont-know>I don't know</button>
        </div>`;
      const typed = answerArea.querySelector('#reviewTypedAnswer');
      typed.value = state.typedAnswer || '';
      typed.addEventListener('input', () => {
        if (activeReview && activeReview.mode === mode) activeReview.typedAnswer = typed.value;
      });
      answerArea.querySelector('[data-check-answer]').addEventListener('click', () => {
        state.revealed = true;
        state.didNotKnow = false;
        renderCurrentReview();
      });
      answerArea.querySelector('[data-dont-know]').addEventListener('click', () => {
        state.typedAnswer = '';
        state.revealed = true;
        state.didNotKnow = true;
        renderCurrentReview();
      });
    } else {
      answerArea.innerHTML = `
        <div class="review-write-correct-answer">
          <span class="review-face-kicker">CORRECT ANSWER</span>
          <div class="review-card-main-text">${escapeHTML(card.answer)}</div>
        </div>
        ${state.typedAnswer.trim() && !state.didNotKnow ? `
          <div class="review-write-your-answer">
            <span class="review-face-kicker">YOUR ANSWER</span>
            <div>${escapeHTML(state.typedAnswer)}</div>
          </div>` : ''}`;
    }
    wrapper.appendChild(answerArea);
  } else {
    const cardButton = document.createElement('button');
    cardButton.type = 'button';
    cardButton.className = `review-flip-card${state.flipped ? ' is-flipped' : ''}`;
    cardButton.setAttribute('aria-label', state.flipped ? 'Show question' : 'Reveal answer');
    cardButton.setAttribute('aria-pressed', String(state.flipped));

    const frontContent = document.createElement('div');
    frontContent.className = 'review-card-face review-card-front';
    frontContent.innerHTML = `
      <span class="review-face-kicker">QUESTION</span>
      <span class="review-card-main-text">${escapeHTML(card.question)}</span>
      <span class="review-card-hint">Select to reveal the answer</span>`;

    const backContent = document.createElement('div');
    backContent.className = 'review-card-face review-card-back';
    backContent.innerHTML = `
      <span class="review-face-kicker">ANSWER</span>
      <span class="review-card-main-text">${escapeHTML(card.answer)}</span>
      <span class="review-card-hint">Select to return to the question</span>`;

    cardButton.append(frontContent, backContent);
    cardButton.addEventListener('click', () => toggleReviewFlip(container, mode));
    wrapper.appendChild(cardButton);
  }

  if (card.image || card.audio) {
    const attachments = document.createElement('div');
    attachments.className = 'review-attachments';
    if (card.image) {
      const image = document.createElement('img');
      image.src = card.image;
      image.alt = 'Flashcard attachment';
      image.className = 'review-attachment-image';
      attachments.appendChild(image);
    }
    if (card.audio) {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'none';
      audio.src = card.audio;
      audio.className = 'review-attachment-audio';
      attachments.appendChild(audio);
    }
    wrapper.appendChild(attachments);
  }

  const controls = document.createElement('div');
  controls.className = 'review-navigation';
  controls.innerHTML = `
    <button type="button" class="review-nav-button" data-review-nav="prev" ${state.index === 0 ? 'disabled' : ''} aria-label="Previous card">← <span>Previous</span></button>
    ${(isWriteAnswer || isMultipleChoice) ? '' : `<button type="button" class="review-flip-button" data-review-flip>${state.flipped ? '↻ Show question' : '↻ Reveal answer'}</button>`}
    <button type="button" class="review-nav-button" data-review-nav="next" ${state.index === entries.length - 1 ? 'disabled' : ''} aria-label="Next card"><span>Next</span> →</button>`;
  controls.querySelector('[data-review-nav="prev"]').addEventListener('click', () => moveReview(-1));
  controls.querySelector('[data-review-nav="next"]').addEventListener('click', () => moveReview(1));
  controls.querySelector('[data-review-flip]')?.addEventListener('click', () => toggleReviewFlip(container, mode));
  wrapper.appendChild(controls);

  if (state.flipped || ((isWriteAnswer || isMultipleChoice) && state.revealed)) {
    const rating = document.createElement('section');
    rating.className = 'review-rating-panel';
    rating.innerHTML = `
      <p class="review-rating-title">How well did you know it?</p>
      <div class="review-rating-buttons">
        <button type="button" class="review-rate rate-again" data-difficulty="errou">Didn't know</button>
        <button type="button" class="review-rate rate-hard" data-difficulty="difícil">Hard</button>
        <button type="button" class="review-rate rate-medium" data-difficulty="médio">Medium</button>
        <button type="button" class="review-rate rate-easy" data-difficulty="fácil">Easy</button>
      </div>
      <p class="review-rating-note">Rating updates this card’s next review date.</p>`;
    rating.querySelectorAll('[data-difficulty]').forEach(button => {
      button.addEventListener('click', () => rateCurrentReviewCard(button.dataset.difficulty));
    });
    wrapper.appendChild(rating);
  }

  const meta = document.createElement('div');
  meta.className = 'review-card-meta';
  meta.innerHTML = `
    <span>${escapeHTML(deck.name)}</span>
    <span class="${isCardDue(card) ? 'review-due-label' : 'review-scheduled-label'}">
      ${isCardDue(card) ? 'Due for review' : `Next review: ${escapeHTML(new Date(card.nextReview).toLocaleDateString())}`}
    </span>`;
  wrapper.appendChild(meta);

  const utility = document.createElement('div');
  utility.className = 'review-utility-actions';
  utility.innerHTML = `
    <button type="button" data-review-action="favorite">${card.favorite ? '★ Remove favourite' : '☆ Add favourite'}</button>
    <button type="button" data-review-action="edit">Edit card</button>
    <button type="button" data-review-action="delete">Delete card</button>`;
  utility.querySelector('[data-review-action="favorite"]').addEventListener('click', () => {
    toggleFavoriteDeckFlashcard(deck.id, card.id);
    renderCurrentReview();
  });
  utility.querySelector('[data-review-action="edit"]').addEventListener('click', () => {
    editDeckFlashcard(deck.id, card.id);
    renderCurrentReview();
  });
  utility.querySelector('[data-review-action="delete"]').addEventListener('click', () => {
    deleteDeckFlashcard(deck.id, card.id);
  });
  wrapper.appendChild(utility);

  container.appendChild(wrapper);
}

function renderCurrentReview() {
  if (!activeReview) return;
  const container = activeReview.mode === 'today'
    ? $('todayFlashcardsContainer')
    : activeReview.mode === 'zone'
      ? $('difficultyReviewContainer')
      : $('deckFlashcardsContainer');
  renderReviewInterface(container, activeReview.mode);
}

function toggleReviewFlip(container, mode) {
  if (!activeReview || activeReview.mode !== mode) return;
  const currentCard = activeReview.entries[activeReview.index]?.card;
  if (currentCard && (currentCard.cardType === 'multiple' || currentCard.cardType === 'written' || currentCard.answerMode === 'write')) return;
  activeReview.flipped = !activeReview.flipped;

  const card = container?.querySelector('.review-flip-card');
  if (card) {
    card.classList.toggle('is-flipped', activeReview.flipped);
    card.setAttribute('aria-pressed', String(activeReview.flipped));
    card.setAttribute('aria-label', activeReview.flipped ? 'Show question' : 'Reveal answer');
  }

  const flipButton = container?.querySelector('[data-review-flip]');
  if (flipButton) {
    flipButton.textContent = activeReview.flipped ? '↻ Show question' : '↻ Reveal answer';
  }

  // Let the 3D rotation finish before rebuilding the face controls.
  setTimeout(() => {
    if (activeReview?.mode === mode) renderReviewInterface(container, mode);
  }, 370);
}

function moveReview(direction) {
  if (!activeReview) return;
  const nextIndex = activeReview.index + direction;
  if (nextIndex < 0 || nextIndex >= activeReview.entries.length) return;
  activeReview.index = nextIndex;
  activeReview.flipped = false;
  activeReview.revealed = false;
  activeReview.didNotKnow = false;
  activeReview.typedAnswer = '';
  activeReview.selectedMCOptions = [];
  activeReview.mcChecked = false;
  activeReview.mcFullyCorrect = false;
  activeReview.didNotKnow = false;
  renderCurrentReview();
}

function rateCurrentReviewCard(difficulty) {
  if (!activeReview) return;
  const state = activeReview;
  const entry = state.entries[state.index];
  if (!entry) return;

  updateDeckCard(
    entry.deck.id,
    entry.card.id,
    difficulty !== 'errou',
    difficulty,
    { silent: true, skipReviewRender: true }
  );

  if (state.mode === 'today' || state.mode === 'zone' || state.mode === 'mixed') {
    // A rated card leaves this practice session, so it cannot immediately
    // reappear even if its new rating matches the zone being practised.
    state.entries.splice(state.index, 1);
    state.index = 0;
  } else {
    // Refresh the deck in due-date order and return to its first due card
    // (or the earliest upcoming card if nothing else is due).
    const refreshedDeck = findDeckById(state.deckId);
    if (refreshedDeck) {
      state.entries = getOrderedDeckCards(refreshedDeck).map(card => ({ card, deck: refreshedDeck }));
      state.index = 0;
    }
  }

  state.flipped = false;
  state.revealed = false;
  state.didNotKnow = false;
  state.typedAnswer = '';
  renderCurrentReview();
  renderDeckList();
  // Refresh the daily-review session only when it is the active session.
  if (state.mode === 'today') {
    renderTodayReview();
  }
}


function renderMixDeckSelection() {
  const container = $('mixDeckSelection');
  if (!container) return;
  const decks = getAllDecks(appData.folders);
  if (!decks.length) {
    container.innerHTML = '<p class="empty-state">Create some decks before mixing them.</p>';
    return;
  }
  container.replaceChildren();
  decks.forEach(({ deck, folderId }) => {
    const label = document.createElement('label');
    label.className = 'mix-deck-choice';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = deck.id;
    checkbox.checked = selectedMixDeckIds.has(deck.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedMixDeckIds.add(deck.id);
      else selectedMixDeckIds.delete(deck.id);
    });
    const copy = document.createElement('span');
    copy.innerHTML = `<strong>${escapeHTML(deck.name)}</strong><small>${escapeHTML(getDeckPath(appData.folders, deck.id) || 'Unfiled')} · ${deck.flashcards.length} cards</small>`;
    label.append(checkbox, copy);
    container.appendChild(label);
  });
}

function startMixedDeckReview() {
  const chosenIds = new Set(selectedMixDeckIds);
  if (chosenIds.size < 2) {
    alert('Please select at least two decks to create a mixed review.');
    return;
  }
  const entries = [];
  getAllDecks(appData.folders).forEach(({ deck }) => {
    if (chosenIds.has(deck.id)) {
      deck.flashcards.forEach(card => entries.push({ card, deck }));
    }
  });
  if (!entries.length) {
    alert('The selected decks do not contain any flashcards yet.');
    return;
  }
  const shouldShuffle = $('mixShuffle')?.checked ?? true;
  const ordered = shouldShuffle
    ? shuffleArray(entries)
    : entries.sort((a, b) => {
        const dueOrder = (isCardDue(a.card) ? 0 : 1) - (isCardDue(b.card) ? 0 : 1);
        return dueOrder || Number(a.card.nextReview) - Number(b.card.nextReview);
      });
  activeReview = {
    mode: 'mixed',
    deckId: null,
    entries: ordered,
    index: 0,
    flipped: false,
    revealed: false,
    typedAnswer: '',
    selectedMCOptions: [],
    mcChecked: false,
    mixedDeckIds: [...chosenIds],
    mixedShuffled: shouldShuffle
  };
  const heading = $('deckFlashcardsTitle');
  if (heading) heading.textContent = 'Mixed deck review';
  showSection('deckFlashcardsSection');
  renderCurrentReview();
}

function renderDeckFlashcards(deckId) {
  const container = $('deckFlashcardsContainer');
  if (!container) return;
  const deck = findDeckById(deckId);

  if (!deck) {
    activeReview = null;
    container.innerHTML = '<p>Deck not found.</p>';
    return;
  }

  if (!activeReview || activeReview.mode !== 'deck' || activeReview.deckId !== deckId) {
    createReviewState('deck', getOrderedDeckCards(deck).map(card => ({ card, deck })), deckId);
  } else {
    const currentId = activeReview.entries[activeReview.index]?.card.id;
    activeReview.entries = getOrderedDeckCards(deck).map(card => ({ card, deck }));
    const newIndex = activeReview.entries.findIndex(item => item.card.id === currentId);
    activeReview.index = newIndex >= 0 ? newIndex : Math.min(activeReview.index, activeReview.entries.length - 1);
  }
  renderReviewInterface(container, 'deck');
}

function showDeckFlashcards(folderId, deckId) {
  const deck = findDeckById(deckId);
  const heading = $('deckFlashcardsTitle');
  if (heading) heading.textContent = deck ? deck.name : 'Deck flashcards';

  activeReview = null;
  showSection('deckFlashcardsSection');
  renderDeckFlashcards(deckId);
}

function renderTodayReviewListOnly() {
  const container = $('todayFlashcardsContainer');
  if (!container) return;
  if (!activeReview || activeReview.mode !== 'today') {
    renderTodayReview();
    return;
  }
  renderReviewInterface(container, 'today');
}

function renderTodayReview() {
  const container = $('todayFlashcardsContainer');
  if (!container) return;

  // Refresh the hidden daily-review panel without replacing an active deck
  // session. When the daily-review section is visible, it becomes active.
  const preserveActiveReview = activeReview &&
    activeReview.mode !== 'today' &&
    $('todayReviewSection')?.classList.contains('hidden');
  const previousActiveReview = preserveActiveReview ? activeReview : null;

  const dueCards = [];
  visitAllCards((card, deck) => {
    if (isCardDue(card)) dueCards.push({ card, deck });
  });

  const cards = randomMode
    ? shuffleArray(dueCards)
    : dueCards.sort((a, b) => Number(a.card.nextReview) - Number(b.card.nextReview));

  if (!activeReview || activeReview.mode !== 'today') {
    createReviewState('today', cards);
  } else {
    const currentId = activeReview.entries[activeReview.index]?.card.id;
    // Refresh due cards without losing the current position if possible.
    const ratedIds = new Set(activeReview.ratedIds || []);
    activeReview.entries = cards.filter(entry => !ratedIds.has(entry.card.id));
    const newIndex = activeReview.entries.findIndex(item => item.card.id === currentId);
    if (newIndex >= 0) activeReview.index = newIndex;
    else activeReview.index = Math.min(activeReview.index, activeReview.entries.length - 1);
  }

  renderReviewInterface(container, 'today');
  if (preserveActiveReview) activeReview = previousActiveReview;
}

function checkDeckAnswer(deckId, cardId) {
  if (activeReview?.mode === 'deck' && activeReview.deckId === deckId) {
    activeReview.flipped = true;
    renderCurrentReview();
  }
}

function checkTodayAnswer(deckId, cardId) {
  if (activeReview?.mode === 'today') {
    activeReview.flipped = true;
    renderCurrentReview();
  }
}

/* -------------------- Deck List -------------------- */

function renderDeckList() {
  const container = $('deckList');
  if (!container) return;

  container.replaceChildren();

  let decks = getAllDecks(appData.folders);
  const searchInput = $('deckSearchQuery');
  const query = searchInput?.value.trim().toLowerCase() || '';

  if (query) {
    decks = decks.filter(({ deck }) =>
      deck.name.toLowerCase().includes(query)
    );
  }

  if (!decks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No decks found. Create a folder and deck in Manage.</p>
      </div>
    `;
    return;
  }

  decks.forEach(({ deck, folderId }) => {
    const due = countDueFlashcards(deck.flashcards);
    const item = document.createElement('div');

    item.className = 'deck-item';

    item.innerHTML = `
      <span class="deck-item-info">
        <span class="deck-status ${due > 0 ? 'status-due' : 'status-ok'}"></span>
        <span>
          <strong>${escapeHTML(deck.name)}</strong>
          <small>
            ${deck.flashcards.length} card(s) · ${due} due
          </small>
        </span>
      </span>

      <span class="deck-actions">
        <label class="deck-mix-select"><input type="checkbox" data-action="mix-select" value="${escapeHTML(deck.id)}" ${selectedMixDeckIds.has(deck.id) ? 'checked' : ''}> Mix</label>
        <button type="button" data-action="review">Review</button>
        <button type="button" data-action="move">Move deck</button>
      </span>
    `;

    item.querySelector('[data-action="mix-select"]').addEventListener('change', event => {
      if (event.target.checked) selectedMixDeckIds.add(deck.id);
      else selectedMixDeckIds.delete(deck.id);
      renderMixDeckSelection();
    });

    item.querySelector('[data-action="review"]').addEventListener('click', () => {
      showDeckFlashcards(folderId, deck.id);
    });

    item.querySelector('[data-action="move"]').addEventListener('click', () => {
      moveDeckPrompt(folderId, deck.id);
    });

    container.appendChild(item);
  });
  renderMixDeckSelection();
}

/* -------------------- Folder Management -------------------- */

function renderFolderTree() {
  const container = $('folderTree');

  if (container) {
    container.replaceChildren();

    if (!appData.folders.length) {
      container.innerHTML = '<div class="empty-state"><p>No folders yet. Create one below to get started.</p></div>';
    } else {
      appData.folders.forEach(folder => {
        container.appendChild(buildFolderElement(folder, 0));
      });
    }
  }

  updateParentFolderSelect();
  updateFolderAndDeckSelects();
  applyFolderTreeFilter();
}

function getFolderSummary(folder) {
  let decks = 0;
  let cards = 0;
  let due = 0;
  function count(items) {
    items.forEach(item => {
      decks += item.decks.length;
      item.decks.forEach(deck => {
        cards += deck.flashcards.length;
        due += countDueFlashcards(deck.flashcards);
      });
      count(item.subfolders);
    });
  }
  count([folder]);
  return { decks, cards, due };
}


function reorderFolder(folderId, direction) {
  function findSiblings(folders) {
    const index = folders.findIndex(folder => folder.id === folderId);
    if (index !== -1) return folders;
    for (const folder of folders) {
      const found = findSiblings(folder.subfolders || []);
      if (found) return found;
    }
    return null;
  }
  const siblings = findSiblings(appData.folders);
  if (!siblings) return;
  const index = siblings.findIndex(folder => folder.id === folderId);
  const target = index + direction;
  if (target < 0 || target >= siblings.length) return;
  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
  saveData();
  renderFolderTree();
}

function buildFolderElement(folder, depth) {
  const wrapper = document.createElement('div');
  wrapper.className = 'folder-item';
  wrapper.dataset.folderName = folder.name.toLowerCase();
  wrapper.style.marginLeft = `${Math.min(depth, 10) * 12}px`;

  const header = document.createElement('div');
  header.className = 'folder-row';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'folder-title-group';
  const icon = document.createElement('span');
  icon.className = 'folder-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '▰';
  const titleCopy = document.createElement('span');
  titleCopy.className = 'folder-title-copy';
  const title = document.createElement('strong');
  title.textContent = folder.name;
  const summary = getFolderSummary(folder);
  const summaryText = document.createElement('small');
  summaryText.textContent = `${summary.decks} deck${summary.decks === 1 ? '' : 's'} · ${summary.cards} card${summary.cards === 1 ? '' : 's'} · ${summary.due} due`;
  titleCopy.append(title, summaryText);
  titleGroup.append(icon, titleCopy);
  header.appendChild(titleGroup);

  const actions = document.createElement('span');
  actions.className = 'folder-actions';

  const upButton = document.createElement('button');
  upButton.type = 'button';
  upButton.textContent = '↑';
  upButton.title = `Move ${folder.name} up`;
  upButton.setAttribute('aria-label', `Move ${folder.name} up`);
  upButton.addEventListener('click', () => reorderFolder(folder.id, -1));

  const downButton = document.createElement('button');
  downButton.type = 'button';
  downButton.textContent = '↓';
  downButton.title = `Move ${folder.name} down`;
  downButton.setAttribute('aria-label', `Move ${folder.name} down`);
  downButton.addEventListener('click', () => reorderFolder(folder.id, 1));

  const renameButton = document.createElement('button');
  renameButton.type = 'button';
  renameButton.textContent = '✎ Rename';
  renameButton.title = `Rename ${folder.name}`;
  renameButton.addEventListener('click', () => renameFolderPrompt(folder.id));

  const moveButton = document.createElement('button');
  moveButton.type = 'button';
  moveButton.textContent = '↗ Move';
  moveButton.title = `Move ${folder.name}`;
  moveButton.addEventListener('click', () => moveFolderPrompt(folder.id));

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.textContent = '× Delete';
  deleteButton.title = `Delete ${folder.name} and its contents`;
  deleteButton.addEventListener('click', () => deleteFolderPrompt(folder.id));

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'toggle-folder-btn';
  toggleButton.textContent = '⌄ Hide';
  toggleButton.setAttribute('aria-expanded', 'true');
  toggleButton.setAttribute('aria-label', `Collapse ${folder.name}`);

  actions.append(upButton, downButton, renameButton, moveButton, deleteButton, toggleButton);
  header.appendChild(actions);
  wrapper.appendChild(header);

  const children = document.createElement('div');
  children.className = 'folder-children';

  toggleButton.addEventListener('click', () => {
    const hidden = children.classList.toggle('hidden');
    toggleButton.setAttribute('aria-expanded', String(!hidden));
    toggleButton.textContent = hidden ? '› Show' : '⌄ Hide';
    toggleButton.setAttribute('aria-label', `${hidden ? 'Expand' : 'Collapse'} ${folder.name}`);
  });

  folder.decks.forEach(deck => {
    const due = countDueFlashcards(deck.flashcards);
    const deckRow = document.createElement('div');
    deckRow.className = 'deck-item';
    deckRow.dataset.deckName = deck.name.toLowerCase();

    const info = document.createElement('span');
    info.className = 'deck-item-info';
    const status = document.createElement('span');
    status.className = `deck-status ${due > 0 ? 'status-due' : 'status-ok'}`;
    status.setAttribute('aria-label', due > 0 ? `${due} cards due` : 'No cards due');
    const copy = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = deck.name;
    const small = document.createElement('small');
    small.textContent = `${deck.flashcards.length} card${deck.flashcards.length === 1 ? '' : 's'} · ${due} due`;
    copy.append(strong, small);
    info.append(status, copy);
    deckRow.appendChild(info);

    const deckActions = document.createElement('span');
    deckActions.className = 'deck-actions';
    const addAction = (label, action, handler) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.action = action;
      button.addEventListener('click', handler);
      deckActions.appendChild(button);
    };
    addAction('▶ Review', 'review', () => showDeckFlashcards(folder.id, deck.id));
    addAction('✎ Rename', 'rename', () => renameDeckPrompt(folder.id, deck.id));
    addAction('↗ Move', 'move', () => moveDeckPrompt(folder.id, deck.id));
    addAction('× Delete', 'delete', () => deleteDeckPrompt(folder.id, deck.id));
    deckRow.appendChild(deckActions);
    children.appendChild(deckRow);
  });

  if (!folder.decks.length && !folder.subfolders.length) {
    const note = document.createElement('p');
    note.className = 'folder-empty-note';
    note.textContent = 'This folder is empty. Create a deck or a subfolder to get started.';
    children.appendChild(note);
  }

  folder.subfolders.forEach(subfolder => {
    children.appendChild(buildFolderElement(subfolder, depth + 1));
  });

  wrapper.appendChild(children);
  return wrapper;
}

function applyFolderTreeFilter() {
  const query = ($('folderTreeSearch')?.value || '').trim().toLowerCase();
  const tree = $('folderTree');
  if (!tree) return;

  tree.querySelectorAll('.folder-item').forEach(folderElement => {
    const text = folderElement.textContent.toLowerCase();
    const matches = !query || text.includes(query);
    folderElement.style.display = matches ? '' : 'none';
    if (query && matches) {
      const children = folderElement.querySelector(':scope > .folder-children');
      if (children) children.classList.remove('hidden');
      const toggle = folderElement.querySelector(':scope > .folder-row .toggle-folder-btn');
      if (toggle) {
        toggle.textContent = '⌄ Hide';
        toggle.setAttribute('aria-expanded', 'true');
      }
    }
  });
}

function toggleAllFolders() {
  const tree = $('folderTree');
  const button = $('toggleAllFolders');
  if (!tree || !button) return;
  const expand = button.getAttribute('aria-expanded') !== 'true';
  tree.querySelectorAll('.folder-item').forEach(folderElement => {
    const children = folderElement.querySelector(':scope > .folder-children');
    const toggle = folderElement.querySelector(':scope > .folder-row .toggle-folder-btn');
    if (!children || !toggle) return;
    children.classList.toggle('hidden', !expand);
    toggle.textContent = expand ? '⌄ Hide' : '› Show';
    toggle.setAttribute('aria-expanded', String(expand));
  });
  button.setAttribute('aria-expanded', String(expand));
  button.textContent = expand ? '⌄ Collapse all' : '› Expand all';
}

function toggleFolderChildren(id) {
  $(id)?.classList.toggle('hidden');
}

function addFolder(name, parentId = '') {
  if (!name.trim()) {
    alert('Please enter a folder name.');
    return;
  }

  const newFolder = {
    id: generateId('folder'),
    name: name.trim(),
    subfolders: [],
    decks: []
  };

  if (!parentId) {
    appData.folders.push(newFolder);
  } else {
    const parent = findFolderById(appData.folders, parentId);

    if (!parent) {
      alert('Parent folder not found.');
      return;
    }

    parent.subfolders.push(newFolder);
  }

  saveData();
  renderFolderTree();
  renderDeckList();

  $('folderForm')?.reset();
}

function renameFolderPrompt(folderId) {
  const folder = findFolderById(appData.folders, folderId);
  if (!folder) return;

  const name = prompt('Enter the new folder name:', folder.name);
  if (name === null || !name.trim()) return;

  folder.name = name.trim();

  saveData();
  renderFolderTree();
  renderDeckList();
}

function deleteFolderPrompt(folderId) {
  const folder = findFolderById(appData.folders, folderId);
  if (!folder) return;

  if (!confirm(
    `Delete "${folder.name}" and all its decks, subfolders and flashcards?`
  )) return;

  function remove(folders) {
    const index = folders.findIndex(item => item.id === folderId);

    if (index !== -1) {
      folders.splice(index, 1);
      return true;
    }

    for (const item of folders) {
      if (remove(item.subfolders)) return true;
    }

    return false;
  }

  remove(appData.folders);

  saveData();
  renderFolderTree();
  renderDeckList();
  renderTodayReview();
  renderDifficultyZones();
  renderStatsContent();
}

function isDescendantFolder(folder, possibleDescendantId) {
  for (const child of folder.subfolders) {
    if (child.id === possibleDescendantId) return true;

    if (isDescendantFolder(child, possibleDescendantId)) {
      return true;
    }
  }

  return false;
}

function moveFolderPrompt(folderId) {
  const folder = findFolderById(appData.folders, folderId);
  if (!folder) return;

  const destinations = [{ id: '', label: 'Top level (no parent)' }];
  function collect(folders, depth = 0) {
    folders.forEach(item => {
      if (item.id !== folderId && !isDescendantFolder(folder, item.id)) {
        destinations.push({ id: item.id, label: `${'— '.repeat(depth)}${item.name}` });
      }
      collect(item.subfolders, depth + 1);
    });
  }
  collect(appData.folders);
  const promptText = `Move “${folder.name}” to which destination? Enter a number:\n\n` +
    destinations.map((item, index) => `${index + 1}. ${item.label}`).join('\n');
  const answer = prompt(promptText, '1');
  if (answer === null) return;
  const choice = Number(answer);
  if (!Number.isInteger(choice) || choice < 1 || choice > destinations.length) {
    alert('Please enter one of the listed numbers.');
    return;
  }
  moveFolder(folderId, destinations[choice - 1].id);
}

function moveFolder(folderId, newParentId = '') {
  const folder = findFolderById(appData.folders, folderId);
  if (!folder) return;

  if (newParentId === folderId) {
    alert('A folder cannot be moved inside itself.');
    return;
  }

  if (
    newParentId &&
    isDescendantFolder(folder, newParentId)
  ) {
    alert('A folder cannot be moved inside one of its own subfolders.');
    return;
  }

  if (newParentId && !findFolderById(appData.folders, newParentId)) {
    alert('The destination folder was not found.');
    return;
  }

  let movingFolder = null;

  function remove(folders) {
    const index = folders.findIndex(item => item.id === folderId);

    if (index !== -1) {
      movingFolder = folders.splice(index, 1)[0];
      return true;
    }

    for (const item of folders) {
      if (remove(item.subfolders)) return true;
    }

    return false;
  }

  remove(appData.folders);

  if (!movingFolder) return;

  if (!newParentId) {
    appData.folders.push(movingFolder);
  } else {
    const destination = findFolderById(appData.folders, newParentId);

    if (!destination) {
      // Restore the folder if the destination unexpectedly disappears.
      appData.folders.push(movingFolder);
      return;
    }

    destination.subfolders.push(movingFolder);
  }

  saveData();
  renderFolderTree();
  renderDeckList();
}

/* -------------------- Deck Management -------------------- */

function addDeck(name, folderId) {
  if (!name.trim()) {
    alert('Please enter a deck name.');
    return;
  }

  const folder = findFolderById(appData.folders, folderId);

  if (!folder) {
    alert('Please select a valid folder first.');
    return;
  }

  folder.decks.push({
    id: generateId('deck'),
    name: name.trim(),
    flashcards: []
  });

  saveData();
  renderFolderTree();
  renderDeckList();
  updateFolderAndDeckSelects();

  $('deckForm')?.reset();
}

function renameDeckPrompt(folderId, deckId) {
  const folder = findFolderById(appData.folders, folderId);
  const deck = folder?.decks.find(item => item.id === deckId);

  if (!deck) return;

  const name = prompt('Enter the new deck name:', deck.name);
  if (name === null || !name.trim()) return;

  deck.name = name.trim();

  saveData();
  renderFolderTree();
  renderDeckList();
  updateFolderAndDeckSelects();
}

function deleteDeckPrompt(folderId, deckId) {
  const folder = findFolderById(appData.folders, folderId);
  const deck = folder?.decks.find(item => item.id === deckId);

  if (!folder || !deck) return;

  if (!confirm(
    `Delete "${deck.name}" and all its flashcards?`
  )) return;

  folder.decks = folder.decks.filter(item => item.id !== deckId);

  saveData();
  renderFolderTree();
  renderDeckList();
  renderTodayReview();
  renderDifficultyZones();
  renderStatsContent();
  updateFolderAndDeckSelects();

  if ($('deckFlashcardsTitle')?.textContent === deck.name) {
    showSection('reviewDecksSection');
  }
}

function removeDeckFromFolder(folders, folderId, deckId) {
  for (const folder of folders) {
    if (folder.id === folderId) {
      const index = folder.decks.findIndex(deck => deck.id === deckId);

      if (index !== -1) {
        return folder.decks.splice(index, 1)[0];
      }
    }

    const nested = removeDeckFromFolder(
      folder.subfolders,
      folderId,
      deckId
    );

    if (nested) return nested;
  }

  return null;
}

function moveDeckPrompt(folderId, deckId) {
  const sourceFolder = findFolderById(appData.folders, folderId);
  const deck = sourceFolder?.decks.find(item => item.id === deckId);
  if (!deck) return;

  const destinations = [];
  function collect(folders, depth = 0) {
    folders.forEach(folder => {
      destinations.push({ id: folder.id, label: `${'— '.repeat(depth)}${folder.name}` });
      collect(folder.subfolders, depth + 1);
    });
  }
  collect(appData.folders);
  const promptText = `Move “${deck.name}” to which folder? Enter a number:\n\n` +
    destinations.map((item, index) => `${index + 1}. ${item.label}${item.id === folderId ? ' (current)' : ''}`).join('\n');
  const answer = prompt(promptText, String(Math.max(1, destinations.findIndex(item => item.id === folderId) + 1)));
  if (answer === null) return;
  const choice = Number(answer);
  if (!Number.isInteger(choice) || choice < 1 || choice > destinations.length) {
    alert('Please enter one of the listed numbers.');
    return;
  }
  moveDeck(folderId, deckId, destinations[choice - 1].id);
}

function moveDeck(oldFolderId, deckId, newFolderId) {
  const destination = findFolderById(appData.folders, newFolderId);

  if (!destination) {
    alert('Destination folder not found.');
    return;
  }

  const originalFolder = findFolderById(appData.folders, oldFolderId);
  const deck = originalFolder?.decks.find(item => item.id === deckId);

  if (!deck) {
    alert('Deck not found.');
    return;
  }

  if (oldFolderId === newFolderId) {
    alert('This deck is already in that folder.');
    return;
  }

  const movingDeck = removeDeckFromFolder(
    appData.folders,
    oldFolderId,
    deckId
  );

  if (!movingDeck) {
    alert('Could not move the deck.');
    return;
  }

  destination.decks.push(movingDeck);

  saveData();
  renderFolderTree();
  renderDeckList();
  renderTodayReview();
  updateFolderAndDeckSelects();

  alert('Deck moved successfully.');
}

/* -------------------- Form Selects -------------------- */

function updateParentFolderSelect() {
  const select = $('parentFolder');
  if (!select) return;

  select.replaceChildren(new Option('None — root folder', ''));

  function addOptions(folders, prefix = '') {
    folders.forEach(folder => {
      select.add(new Option(
        `${prefix}${folder.name}`,
        folder.id
      ));

      addOptions(folder.subfolders, `${prefix}— `);
    });
  }

  addOptions(appData.folders);
}

function updateFolderAndDeckSelects() {
  const folderSelect = $('deckFolder');
  const deckSelect = $('fcDeck');

  if (folderSelect) {
    folderSelect.replaceChildren(
      new Option('Select a folder', '')
    );
  }

  if (deckSelect) {
    deckSelect.replaceChildren(
      new Option('Select a deck', '')
    );
  }

  function addOptions(folders, prefix = '') {
    folders.forEach(folder => {
      if (folderSelect) {
        folderSelect.add(new Option(
          `${prefix}${folder.name}`,
          folder.id
        ));
      }

      folder.decks.forEach(deck => {
        if (deckSelect) {
          deckSelect.add(new Option(
            `${prefix}${folder.name} > ${deck.name}`,
            deck.id
          ));
        }
      });

      addOptions(folder.subfolders, `${prefix}— `);
    });
  }

  addOptions(appData.folders);
}

/* -------------------- Difficulty Zones -------------------- */

function getDifficultyZoneEntries(zoneLabel) {
  const entries = [];
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  visitAllCards((card, deck) => {
    if (normalize(card.difficulty) === normalize(zoneLabel)) entries.push({ card, deck });
  });
  if (randomMode) return shuffleArray(entries);
  return entries.sort((a, b) => {
    const aDue = isCardDue(a.card) ? 0 : 1;
    const bDue = isCardDue(b.card) ? 0 : 1;
    return aDue - bDue || Number(a.card.nextReview) - Number(b.card.nextReview);
  });
}

function startDifficultyZonePractice(zoneLabel, zoneTitle) {
  const entries = getDifficultyZoneEntries(zoneLabel);
  const reviewContainer = $('difficultyReviewContainer');
  if (!reviewContainer) return;
  if (!entries.length) {
    reviewContainer.innerHTML = `<div class="review-empty-state"><h3>No cards in ${escapeHTML(zoneTitle)}</h3><p>Rate some cards during review to add them to this difficulty zone.</p></div>`;
    reviewContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  activeReview = {
    mode: 'zone',
    zoneDifficulty: zoneLabel,
    zoneTitle,
    deckId: null,
    entries,
    index: 0,
    flipped: false,
    revealed: false,
    didNotKnow: false,
    typedAnswer: '',
    selectedMCOptions: [],
    mcChecked: false,
    mcFullyCorrect: false
  };
  renderCurrentReview();
  reviewContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderDifficultyZones() {
  const container = $('difficultyZonesContainer');
  if (!container) return;

  container.replaceChildren();

  const zones = {
    facil: { label: 'fácil', title: 'Easy', cards: [] },
    medio: { label: 'médio', title: 'Medium', cards: [] },
    dificil: { label: 'difícil', title: 'Hard', cards: [] },
    errou: { label: 'errou', title: "Didn't know", cards: [] }
  };

  visitAllCards((card, deck) => {
    if (!card.difficulty) return;

    const key = card.difficulty
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (zones[key]) {
      zones[key].cards.push({ card, deck });
    }
  });

  Object.entries(zones).forEach(([key, zone]) => {
    const section = document.createElement('section');
    section.className = 'difficulty-zone';

    const heading = document.createElement('h3');
    heading.textContent = `${zone.title} (${zone.cards.length})`;

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'toggle-folder-btn';
    toggleButton.textContent = 'Show / hide';

    const cardsContainer = document.createElement('div');
    cardsContainer.id = `zone-${key}`;
    cardsContainer.className = 'zone-cards hidden';

    toggleButton.addEventListener('click', () => {
      const hidden = cardsContainer.classList.toggle('hidden');
      toggleButton.textContent = hidden ? 'Show / hide' : 'Hide cards';
    });

    const practiceButton = document.createElement('button');
    practiceButton.type = 'button';
    practiceButton.className = 'zone-practice-button';
    practiceButton.textContent = `Practise ${zone.title.toLowerCase()}`;
    practiceButton.disabled = zone.cards.length === 0;
    practiceButton.addEventListener('click', () => startDifficultyZonePractice(zone.label, zone.title));

    const headingActions = document.createElement('span');
    headingActions.className = 'zone-heading-actions';
    headingActions.append(practiceButton, toggleButton);
    heading.appendChild(headingActions);
    section.appendChild(heading);

    if (!zone.cards.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No cards in this category yet.';
      cardsContainer.appendChild(empty);
    }

    zone.cards.forEach(({ card, deck }) => {
      const cardElement = document.createElement('article');
      cardElement.className = `flashcard ${getFlashcardClass(card)}`;

      cardElement.innerHTML = `
        <p><strong>Question:</strong> ${escapeHTML(card.question)}</p>
        <p><strong>Subject:</strong> ${escapeHTML(card.subject)}</p>
        <p><strong>Deck path:</strong>
          ${escapeHTML(getDeckPath(appData.folders, deck.id))}
        </p>
        <p><strong>Answer:</strong>
          <span class="answer-correct">${escapeHTML(card.answer)}</span>
        </p>
        <p><strong>Next review:</strong>
          ${escapeHTML(new Date(card.nextReview).toLocaleDateString())}
        </p>
        <p><strong>Difficulty:</strong> ${zone.title}</p>
      `;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remove from category';
      removeButton.addEventListener('click', () => {
        removeFlashcardFromZone(card.id, zone.label);
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = 'Delete flashcard';
      deleteButton.addEventListener('click', () => {
        deleteDeckFlashcard(deck.id, card.id);
      });

      cardElement.append(removeButton, deleteButton);
      cardsContainer.appendChild(cardElement);
    });

    section.appendChild(cardsContainer);
    container.appendChild(section);
  });
}

function removeFlashcardFromZone(cardId, zone) {
  if (!confirm('Remove this flashcard from its difficulty category?')) return;

  let found = false;

  visitAllCards(card => {
    if (card.id === cardId && card.difficulty === zone) {
      card.difficulty = null;
      found = true;
    }
  });

  if (found) {
    saveData();
    renderDifficultyZones();
  }
}

function toggleZone(id) {
  $(id)?.classList.toggle('hidden');
}

/* -------------------- Theme -------------------- */

function updateThemeButton() {
  const button = $('toggleTheme');
  if (!button) return;

  const isLight = document.body.classList.contains('light-mode');

  button.textContent = isLight ? '☾ Dark mode' : '☼ Light mode';
  button.setAttribute(
    'aria-label',
    isLight ? 'Switch to dark mode' : 'Switch to light mode'
  );
  button.setAttribute('aria-pressed', String(isLight));
}

function initialiseTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';

  document.body.classList.toggle(
    'light-mode',
    savedTheme === 'light'
  );

  updateThemeButton();

  $('toggleTheme')?.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-mode');

    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateThemeButton();
  });
}

/* -------------------- Notifications -------------------- */

const NOTIFICATION_INTERVALS = {
  off: 0,
  '1m': 1 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000
};

function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('This browser does not support desktop notifications.');
    return;
  }

  if (Notification.permission === 'granted') return;
  if (Notification.permission === 'denied') {
    alert('FlashMaster notifications are blocked by your browser. You can enable them in your browser site settings.');
    return;
  }

  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      checkNotifications();
    } else {
      alert('Notifications were not enabled. You can allow them in your browser site settings.');
    }
  }).catch(error => {
    console.warn('Notification permission was not granted:', error);
  });
}

function initialiseNotifications() {
  const select = $('notificationInterval');
  const savedInterval = localStorage.getItem('notificationInterval') || 'off';
  const validInterval = Object.prototype.hasOwnProperty.call(NOTIFICATION_INTERVALS, savedInterval)
    ? savedInterval
    : 'off';

  if (select) select.value = validInterval;
  localStorage.setItem('notificationInterval', validInterval);

  if (select) {
    select.addEventListener('change', () => {
      const interval = Object.prototype.hasOwnProperty.call(NOTIFICATION_INTERVALS, select.value)
        ? select.value
        : 'off';
      localStorage.setItem('notificationInterval', interval);

      if (interval === 'off') return;

      // Start the chosen interval from the moment the user selects it.
      localStorage.setItem('lastNotificationAt', String(Date.now()));
      requestNotificationPermission();
    });
  }
}

function checkNotifications() {
  const intervalKey = localStorage.getItem('notificationInterval') || 'off';
  const intervalMs = NOTIFICATION_INTERVALS[intervalKey] || 0;
  if (!intervalMs || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const dueCount = getStatistics().due;
  if (!dueCount) return;

  const now = Date.now();
  const lastNotificationAt = Number(localStorage.getItem('lastNotificationAt') || 0);

  // If the preference is new or has no timestamp, wait one full interval.
  if (!lastNotificationAt) {
    localStorage.setItem('lastNotificationAt', String(now));
    return;
  }
  if (now - lastNotificationAt < intervalMs) return;

  try {
    new Notification('FlashMaster review reminder', {
      body: `You have ${dueCount} flashcard${dueCount === 1 ? '' : 's'} due for review.`,
      tag: 'flashmaster-due-review'
    });
    localStorage.setItem('lastNotificationAt', String(now));
  } catch (error) {
    console.warn('Could not show notification:', error);
  }
}

/* -------------------- Backup & Restore -------------------- */

function exportData() {
  const data = localStorage.getItem('appData');

  if (!data) {
    alert('There is no data to export.');
    return;
  }

  let exportPayload;
  try {
    exportPayload = JSON.stringify({ ...JSON.parse(data), studyHistory: loadStudyHistory() });
  } catch (error) {
    alert('Your data could not be prepared for export.');
    return;
  }
  const blob = new Blob([exportPayload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = 'flashmaster-backup.json';
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importData() {
  const file = $('importData')?.files[0];

  if (!file) {
    alert('Please select a JSON backup file first.');
    return;
  }

  const reader = new FileReader();

  reader.onload = event => {
    try {
      const imported = JSON.parse(event.target.result);

      if (!imported || !Array.isArray(imported.folders)) {
        throw new Error('The file does not contain valid FlashMaster data.');
      }

      if (!confirm(
        'Import this backup? Your current FlashMaster data will be replaced.'
      )) return;

      function validateFolders(folders) {
        folders.forEach(folder => {
          if (!folder.id || !folder.name) {
            throw new Error('A folder is missing its ID or name.');
          }

          if (!Array.isArray(folder.decks)) folder.decks = [];
          if (!Array.isArray(folder.subfolders)) folder.subfolders = [];

          folder.decks.forEach(deck => {
            if (!deck.id || !deck.name) {
              throw new Error('A deck is missing its ID or name.');
            }

            if (!Array.isArray(deck.flashcards)) {
              deck.flashcards = [];
            }

            deck.flashcards.forEach(card => {
              if (!card.id || typeof card.question !== 'string') {
                throw new Error('A flashcard has invalid data.');
              }

              if (typeof card.answer !== 'string') card.answer = '';
              if (typeof card.subject !== 'string') card.subject = '';
              if (!Number.isFinite(card.nextReview)) {
                card.nextReview = Date.now();
              }
              if (!Number.isFinite(card.interval)) card.interval = 1;
              if (!Number.isFinite(card.easiness)) card.easiness = 2.5;
              if (!Number.isFinite(card.repetition)) card.repetition = 0;
              if (typeof card.favorite !== 'boolean') card.favorite = false;
              if (typeof card.image !== 'string') card.image = '';
              if (typeof card.audio !== 'string') card.audio = '';
            });
          });

          validateFolders(folder.subfolders);
        });
      }

      validateFolders(imported.folders);

      // Study history is optional: legacy backups remain fully supported.
      const importedStudyHistory = Array.isArray(imported.studyHistory)
        ? imported.studyHistory.filter(event =>
            event && Number.isFinite(Number(event.timestamp)) &&
            typeof event.deckId === 'string' && typeof event.cardId === 'string'
          ).slice(-5000)
        : [];
      delete imported.studyHistory;

      localStorage.setItem('appData', JSON.stringify(imported));
      localStorage.setItem(STUDY_HISTORY_KEY, JSON.stringify(importedStudyHistory));
      appData = imported;

      saveData();
      renderFolderTree();
      renderDeckList();
      renderTodayReview();
      renderDifficultyZones();
      renderStatsContent();

      alert('Backup imported successfully.');
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    }
  };

  reader.onerror = () => {
    alert('The backup file could not be read.');
  };

  reader.readAsText(file);
}

/* -------------------- Data Validation -------------------- */

function validateAppData() {
  if (!appData || !Array.isArray(appData.folders)) {
    appData = { folders: [] };
  }

  function validateFolders(folders) {
    folders.forEach(folder => {
      if (!Array.isArray(folder.decks)) folder.decks = [];
      if (!Array.isArray(folder.subfolders)) folder.subfolders = [];

      folder.decks.forEach(deck => {
        if (!Array.isArray(deck.flashcards)) deck.flashcards = [];

        deck.flashcards.forEach(card => {
          // Preserve existing values; add only missing fields.
          if (!Number.isFinite(card.nextReview)) {
            card.nextReview = Date.now();
          }

          if (!Number.isFinite(card.interval)) card.interval = 1;
          if (!Number.isFinite(card.easiness)) card.easiness = 2.5;
          if (!Number.isFinite(card.repetition)) card.repetition = 0;
          if (typeof card.favorite !== 'boolean') card.favorite = false;
          if (typeof card.image !== 'string') card.image = '';
          if (typeof card.audio !== 'string') card.audio = '';
        });
      });

      validateFolders(folder.subfolders);
    });
  }

  validateFolders(appData.folders);
  saveData();
}

/* -------------------- Form Event Listeners -------------------- */

function initialiseForms() {
  const typeSelect = $('fcType');
  const mcOptionsPanel = $('mcOptions');
  const answerField = $('fcAnswer');
  const answerFieldLabel = document.querySelector('label[for="fcAnswer"]');
  const answerModeField = $('fcAnswerMode');
  const answerModeFieldLabel = document.querySelector('label[for="fcAnswerMode"]');
  const optionList = $('fcMCOptionList');

  function addMCOptionRow(text = '', correct = false) {
    if (!optionList) return;
    const row = document.createElement('div');
    row.className = 'mc-create-option';
    row.innerHTML = `<input type="text" class="mc-option-text-input" aria-label="Answer option" placeholder="Enter an answer option" value="${escapeHTML(text)}">
      <label class="mc-option-correct-label"><input type="checkbox" class="mc-option-correct" ${correct ? 'checked' : ''}> Correct</label>
      <button type="button" class="mc-option-remove" aria-label="Remove answer option" title="Remove option">×</button>`;
    row.querySelector('.mc-option-remove').addEventListener('click', () => {
      if (optionList.children.length <= 2) {
        alert('A multiple-choice question needs at least two options.');
        return;
      }
      row.remove();
    });
    optionList.appendChild(row);
  }

  function updateCardTypeFields() {
    const type = typeSelect?.value || 'basic';
    const isMultiple = type === 'multiple';
    const isWritten = type === 'written';
    mcOptionsPanel?.classList.toggle('hidden', !isMultiple);
    answerField?.closest('.field-full')?.classList.toggle('hidden', isMultiple);
    answerField?.toggleAttribute('required', !isMultiple);
    answerFieldLabel?.classList.toggle('hidden', isMultiple);
    answerModeField?.closest('.field-full')?.classList.toggle('hidden', isMultiple || isWritten);
    answerModeFieldLabel?.classList.toggle('hidden', isMultiple || isWritten);
  }

  typeSelect?.addEventListener('change', updateCardTypeFields);
  $('addMCOption')?.addEventListener('click', () => addMCOptionRow());
  if (optionList && !optionList.children.length) {
    addMCOptionRow();
    addMCOptionRow();
    addMCOptionRow();
  }
  updateCardTypeFields();
  $('folderForm')?.addEventListener('submit', event => {
    event.preventDefault();

    addFolder(
      $('folderName')?.value.trim() || '',
      $('parentFolder')?.value || ''
    );
  });

  $('deckForm')?.addEventListener('submit', event => {
    event.preventDefault();

    addDeck(
      $('deckName')?.value.trim() || '',
      $('deckFolder')?.value || ''
    );
  });

  $('flashcardForm')?.addEventListener('submit', event => {
    event.preventDefault();

    const question = $('fcQuestion')?.value.trim() || '';
    const cardType = $('fcType')?.value || 'basic';
    const answer = $('fcAnswer')?.value.trim() || '';
    const subject = $('fcSubject')?.value.trim() || '';
    const deckId = $('fcDeck')?.value || '';
    const answerMode = cardType === 'written' ? 'write' : ($('fcAnswerMode')?.value || 'flip');
    const mcOptions = cardType === 'multiple'
      ? [...document.querySelectorAll('#fcMCOptionList .mc-create-option')].map(row => ({
          text: row.querySelector('.mc-option-text-input')?.value.trim() || '',
          correct: Boolean(row.querySelector('.mc-option-correct')?.checked)
        })).filter(option => option.text)
      : [];
    const effectiveAnswer = cardType === 'multiple'
      ? mcOptions.filter(option => option.correct).map(option => option.text).join('; ')
      : answer;

    if (!question || !subject || !deckId || (cardType !== 'multiple' && !answer)) {
      alert('Please complete all required fields.');
      return;
    }
    if (cardType === 'multiple') {
      const allRows = [...document.querySelectorAll('#fcMCOptionList .mc-create-option')];
      const filledRows = allRows.filter(row => row.querySelector('.mc-option-text-input')?.value.trim());
      if (filledRows.length < 2) {
        alert('Please add at least two answer options.');
        return;
      }
      if (!mcOptions.some(option => option.correct)) {
        alert('Please tick at least one correct answer.');
        return;
      }
    }

    const imageFile = $('fcImage')?.files[0] || null;
    const audioFile = $('fcAudio')?.files[0] || null;

    function readFile(file) {
      return new Promise((resolve, reject) => {
        if (!file) {
          resolve('');
          return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
        reader.readAsDataURL(file);
      });
    }

    Promise.all([
      readFile(imageFile),
      readFile(audioFile)
    ])
      .then(([imageData, audioData]) => {
        createFlashcard(
          question,
          effectiveAnswer,
          subject,
          deckId,
          imageData,
          audioData,
          answerMode,
          cardType,
          mcOptions
        );

        event.target.reset();
        if (optionList) {
          optionList.replaceChildren();
          addMCOptionRow();
          addMCOptionRow();
          addMCOptionRow();
        }
        updateCardTypeFields();
        updateFolderAndDeckSelects();
        alert('Flashcard added successfully!');
      })
      .catch(error => {
        alert(error.message);
      });
  });

  $('exportData')?.addEventListener('click', exportData);
  $('importButton')?.addEventListener('click', importData);

  $('deckSearchQuery')?.addEventListener('input', renderDeckList);
  $('folderTreeSearch')?.addEventListener('input', applyFolderTreeFilter);
  $('toggleAllFolders')?.addEventListener('click', toggleAllFolders);

  $('randomMode')?.addEventListener('click', toggleRandomMode);
  $('startMixedReview')?.addEventListener('click', startMixedDeckReview);
}

/* -------------------- Initialisation -------------------- */

function initialiseFlashMaster() {
  validateAppData();

  initialiseTheme();
  initialiseForms();

  updateParentFolderSelect();
  updateFolderAndDeckSelects();
  updateRandomModeButton();
  initialiseNotifications();

  renderFolderTree();
  renderDeckList();
  renderTodayReview();
  renderDifficultyZones();
  renderStatsContent();

  showSection('reviewDecksSection');

  const splash = $('splash-screen');

  if (splash) {
    setTimeout(() => {
      splash.style.display = 'none';
    }, 1200);
  }

  checkNotifications();

  document.addEventListener('keydown', event => {
    if (!activeReview) return;
    const activeElement = document.activeElement;
    if (activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName)) return;

    const visibleSection = activeReview.mode === 'today'
      ? $('todayReviewSection')
      : activeReview.mode === 'zone'
        ? $('difficultySection')
        : $('deckFlashcardsSection');
    if (!visibleSection || visibleSection.classList.contains('hidden')) return;

    if (event.code === 'Space' || event.key === 'Enter') {
      const focusedReviewControl = activeElement?.matches?.(
        '.review-flip-card, [data-review-flip]'
      );
      if (!focusedReviewControl) {
        if (event.code === 'Space') event.preventDefault();
        const container = activeReview.mode === 'today'
          ? $('todayFlashcardsContainer')
          : activeReview.mode === 'zone'
            ? $('difficultyReviewContainer')
            : $('deckFlashcardsContainer');
        toggleReviewFlip(container, activeReview.mode);
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveReview(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveReview(1);
    }
  });

  // Check frequently so short reminder intervals stay reasonably accurate.
  // Notifications work while this page is open; browsers may pause background tabs.
  setInterval(checkNotifications, 15 * 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialiseFlashMaster);
} else {
  initialiseFlashMaster();
}
