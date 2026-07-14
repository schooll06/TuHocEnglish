import './style.css';
import { 
  getWords, 
  addWord, 
  deleteWord, 
  updateWordStatus, 
  updateWord, 
  getStats, 
  importData, 
  exportData, 
  loadMockDataIfEmpty,
  getActiveUser,
  setActiveUser,
  registerUser,
  loginUser
} from './storage.js';
import { 
  getApiKey, 
  saveApiKey, 
  getGeminiModel, 
  saveGeminiModel, 
  isApiConfigured, 
  testApiKey, 
  translateWord, 
  chatWithTutor,
  generateWordsByTopic
} from './gemini.js';

// --- State Variables ---
let currentWords = [];
let filteredWords = [];
let currentFilter = 'all';
let currentSearch = '';
let flashcardList = [];
let currentFlashcardIndex = 0;
let chatHistory = [];

// --- Speech Synthesis Helper ---
function speakText(text) {
  if ('speechSynthesis' in window) {
    // Stop any ongoing speech
    window.speechSynthesis.cancel();

    // Clean text: remove emoji and code marks for cleaner pronunciation
    const cleanText = text.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '')
                          .replace(/`|_|\*|#/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Read options from localStorage or defaults
    const rate = parseFloat(localStorage.getItem('vibe_english_tts_rate')) || 0.9;
    const volume = parseFloat(localStorage.getItem('vibe_english_tts_volume')) || 0.9;
    
    utterance.lang = 'en-US';
    utterance.rate = rate;
    utterance.volume = volume;

    // Select suitable English voice
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.toLowerCase().includes('en-us') && v.name.toLowerCase().includes('google')) ||
                    voices.find(v => v.lang.toLowerCase().includes('en-gb')) ||
                    voices.find(v => v.lang.toLowerCase().startsWith('en')) ||
                    voices[0];
    
    if (enVoice) {
      utterance.voice = enVoice;
    }

    window.speechSynthesis.speak(utterance);
  } else {
    showToast('Trình duyệt của bạn không hỗ trợ Text-to-Speech.', 'error');
  }
}

// Ensure voices are loaded (specifically for Chrome/Safari)
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {};
}

// --- Toast System ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconClass = 'fa-circle-info';
  if (type === 'success') iconClass = 'fa-circle-check';
  if (type === 'error') iconClass = 'fa-circle-xmark';
  if (type === 'warning') iconClass = 'fa-triangle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid ${iconClass} toast-icon"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 50);

  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- Page Routing ---
function handleNavigation() {
  const hash = window.location.hash || '#vocabulary';
  const views = {
    '#vocabulary': 'vocabulary-view',
    '#flashcards': 'flashcards-view',
    '#chat': 'chat-view',
    '#topics': 'topics-view',
    '#settings': 'settings-view'
  };

  const activeViewId = views[hash] || 'vocabulary-view';

  // Toggle active view section
  document.querySelectorAll('.view-section').forEach(section => {
    section.style.display = section.id === activeViewId ? 'block' : 'none';
  });

  // Toggle nav links active state
  document.querySelectorAll('.nav-link').forEach(link => {
    const linkHash = link.getAttribute('href');
    if (linkHash === hash || (hash === '#vocabulary' && linkHash === '#vocabulary') || (!views[hash] && linkHash === '#vocabulary')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Screen-specific activation logic
  if (hash === '#flashcards') {
    initFlashcards();
  }
  if (hash === '#chat') {
    initChatScroll();
  }
  if (hash === '#topics') {
    initTopicsView();
  }

  // Close modals on nav
  closeVocabModal();
}

// --- Stats Update ---
function updateStatsUI() {
  const stats = getStats();
  document.getElementById('stats-total').innerText = stats.total;
  document.getElementById('stats-learning').innerText = stats.learning;
  document.getElementById('stats-mastered').innerText = stats.mastered;
  document.getElementById('stats-rate').innerText = `${stats.masteryRate}%`;
}

// --- Render Vocabulary List ---
function renderVocabList() {
  const listContainer = document.getElementById('vocab-list');
  const emptyState = document.getElementById('vocab-empty');
  
  if (!listContainer) return;
  
  listContainer.innerHTML = '';
  
  // Apply Search
  filteredWords = currentWords.filter(w => {
    const term = currentSearch.toLowerCase().trim();
    return w.word.toLowerCase().includes(term) || w.meaning.toLowerCase().includes(term);
  });

  // Apply Category Filters
  if (currentFilter === 'learning') {
    filteredWords = filteredWords.filter(w => w.status === 'learning');
  } else if (currentFilter === 'mastered') {
    filteredWords = filteredWords.filter(w => w.status === 'mastered');
  }

  if (filteredWords.length === 0) {
    emptyState.style.display = 'flex';
    listContainer.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  listContainer.style.display = 'grid';

  filteredWords.forEach(w => {
    const card = document.createElement('div');
    card.className = `word-card ${w.status === 'mastered' ? 'card-mastered' : ''}`;
    card.id = `card-${w.id}`;

    // Part of speech badge color helper
    const pos = w.type ? w.type.toLowerCase() : 'noun';
    
    card.innerHTML = `
      <div class="card-header">
        <div class="card-title-group">
          <h3 class="card-word">${w.word}</h3>
          <span class="card-ipa">${w.ipa || ''}</span>
        </div>
        <div class="card-badges">
          <span class="badge badge-type">${w.type || 'Noun'}</span>
          <span class="badge badge-status ${w.status}" data-id="${w.id}">
            ${w.status === 'mastered' ? 'Đã thuộc' : 'Đang học'}
          </span>
        </div>
      </div>
      
      <div class="card-meaning">
        ${w.meaning}
        ${w.meaningCn ? `<div class="card-meaning-cn" style="font-size: 14px; color: var(--color-secondary); margin-top: 4px;"><i class="fa-solid fa-language"></i> ${w.meaningCn}</div>` : ''}
      </div>
      
      ${w.definition ? `<div class="card-definition">${w.definition}</div>` : ''}
      
      ${w.exampleEn ? `
        <div class="card-example">
          <span class="example-en">${w.exampleEn}</span>
          <span class="example-vi">${w.exampleVi || ''}</span>
          ${w.exampleCn ? `<span class="example-cn" style="display: block; font-size: 13px; color: var(--color-secondary); margin-top: 2px;">${w.exampleCn}</span>` : ''}
        </div>
      ` : ''}
      
      ${w.tip ? `
        <div class="card-tip">
          <i class="fa-solid fa-lightbulb"></i>
          <span>${w.tip}</span>
        </div>
      ` : ''}
      
      <div class="card-actions">
        <button class="btn-card-action audio-btn" data-word="${w.word}" data-sentence="${w.exampleEn || ''}" title="Đọc từ vựng">
          <i class="fa-solid fa-volume-high"></i>
        </button>
        <button class="btn-card-action edit-btn" data-id="${w.id}" title="Sửa từ vựng">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn-card-action delete-btn" data-id="${w.id}" title="Xóa từ vựng">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    // Event listener: Toggle status
    card.querySelector('.badge-status').addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      const wordObj = currentWords.find(item => item.id === id);
      if (!wordObj) return;

      const newStatus = wordObj.status === 'mastered' ? 'learning' : 'mastered';
      currentWords = updateWordStatus(id, newStatus);
      showToast(`Đã chuyển "${wordObj.word}" sang "${newStatus === 'mastered' ? 'Đã thuộc' : 'Đang học'}"`, 'success');
      updateStatsUI();
      renderVocabList();
    });

    // Event listener: TTS Speak
    card.querySelector('.audio-btn').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const word = btn.getAttribute('data-word');
      const sentence = btn.getAttribute('data-sentence');
      
      // Speak the word, and optionally the example sentence after a short pause
      speakText(word);
      if (sentence) {
        setTimeout(() => {
          speakText(sentence);
        }, 1200);
      }
    });

    // Event listener: Edit word
    card.querySelector('.edit-btn').addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      openEditModal(id);
    });

    // Event listener: Delete word
    card.querySelector('.delete-btn').addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const wordObj = currentWords.find(item => item.id === id);
      if (confirm(`Bạn có chắc chắn muốn xóa từ "${wordObj.word}"?`)) {
        currentWords = deleteWord(id);
        showToast(`Đã xóa từ "${wordObj.word}"`, 'info');
        updateStatsUI();
        renderVocabList();
      }
    });

    listContainer.appendChild(card);
  });
}

// --- Vocab Add/Edit Modal Control ---
function openAddModal() {
  document.getElementById('vocab-modal-title').innerText = 'Thêm Từ Vựng Mới';
  document.getElementById('vocab-edit-id').value = '';
  document.getElementById('vocab-input-word').value = '';
  document.getElementById('vocab-input-word').disabled = false;
  document.getElementById('vocab-input-ipa').value = '';
  document.getElementById('vocab-input-type').value = 'Noun';
  document.getElementById('vocab-input-meaning').value = '';
  document.getElementById('vocab-input-meaning-cn').value = '';
  document.getElementById('vocab-input-definition').value = '';
  document.getElementById('vocab-input-example-en').value = '';
  document.getElementById('vocab-input-example-vi').value = '';
  document.getElementById('vocab-input-example-cn').value = '';
  document.getElementById('vocab-input-tip').value = '';
  document.getElementById('vocab-modal').classList.add('active');
  document.getElementById('vocab-input-word').focus();
}

function openEditModal(id) {
  const wordObj = currentWords.find(w => w.id === id);
  if (!wordObj) return;

  document.getElementById('vocab-modal-title').innerText = `Sửa Từ: ${wordObj.word}`;
  document.getElementById('vocab-edit-id').value = wordObj.id;
  document.getElementById('vocab-input-word').value = wordObj.word;
  document.getElementById('vocab-input-word').disabled = true; // Don't let them rename the main key directly in edit
  document.getElementById('vocab-input-ipa').value = wordObj.ipa || '';
  document.getElementById('vocab-input-type').value = wordObj.type || 'Noun';
  document.getElementById('vocab-input-meaning').value = wordObj.meaning || '';
  document.getElementById('vocab-input-meaning-cn').value = wordObj.meaningCn || '';
  document.getElementById('vocab-input-definition').value = wordObj.definition || '';
  document.getElementById('vocab-input-example-en').value = wordObj.exampleEn || '';
  document.getElementById('vocab-input-example-vi').value = wordObj.exampleVi || '';
  document.getElementById('vocab-input-example-cn').value = wordObj.exampleCn || '';
  document.getElementById('vocab-input-tip').value = wordObj.tip || '';

  document.getElementById('vocab-modal').classList.add('active');
}

function closeVocabModal() {
  document.getElementById('vocab-modal').classList.remove('active');
  document.getElementById('ai-loading').style.display = 'none';
}

async function handleAiTranslate() {
  const wordInput = document.getElementById('vocab-input-word');
  const word = wordInput.value.trim();
  
  if (!word) {
    showToast('Vui lòng nhập từ tiếng Anh trước khi dịch.', 'warning');
    wordInput.focus();
    return;
  }

  if (!isApiConfigured()) {
    showToast('Chưa cấu hình Gemini API Key. Hãy cấu hình ở trang Cài đặt.', 'error');
    return;
  }

  const loadingIndicator = document.getElementById('ai-loading');
  const translateBtn = document.getElementById('btn-ai-translate');
  
  loadingIndicator.style.display = 'flex';
  translateBtn.disabled = true;

  try {
    const result = await translateWord(word);
    
    // Fill result fields
    document.getElementById('vocab-input-word').value = result.word || word;
    document.getElementById('vocab-input-ipa').value = result.ipa || '';
    document.getElementById('vocab-input-type').value = result.type || 'Noun';
    document.getElementById('vocab-input-meaning').value = result.meaning || '';
    document.getElementById('vocab-input-meaning-cn').value = result.meaningCn || '';
    document.getElementById('vocab-input-definition').value = result.definition || '';
    document.getElementById('vocab-input-example-en').value = result.exampleEn || '';
    document.getElementById('vocab-input-example-vi').value = result.exampleVi || '';
    document.getElementById('vocab-input-example-cn').value = result.exampleCn || '';
    document.getElementById('vocab-input-tip').value = result.tip || '';
    
    showToast(`Gemini đã hoàn thành dịch từ "${word}"!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
    console.error(err);
  } finally {
    loadingIndicator.style.display = 'none';
    translateBtn.disabled = false;
  }
}

async function handleQuickAdd() {
  const inputEl = document.getElementById('quick-add-input');
  const word = inputEl.value.trim();

  if (!word) {
    showToast('Vui lòng nhập từ tiếng Anh hoặc tiếng Việt để thêm.', 'warning');
    inputEl.focus();
    return;
  }

  if (!isApiConfigured()) {
    showToast('Chưa cấu hình Gemini API Key. Hãy cấu hình ở trang Cài đặt.', 'error');
    return;
  }

  const loadingIndicator = document.getElementById('quick-add-loading');
  const addBtn = document.getElementById('btn-quick-add');

  loadingIndicator.style.display = 'block';
  addBtn.disabled = true;
  inputEl.disabled = true;

  try {
    const result = await translateWord(word);
    
    const newWord = addWord({
      word: result.word,
      ipa: result.ipa || '',
      type: result.type || 'Noun',
      meaning: result.meaning || '',
      meaningCn: result.meaningCn || '',
      definition: result.definition || '',
      exampleEn: result.exampleEn || '',
      exampleVi: result.exampleVi || '',
      exampleCn: result.exampleCn || '',
      tip: result.tip || ''
    });

    // Sync in-memory list
    currentWords.unshift(newWord);
    
    // Clear input
    inputEl.value = '';
    
    showToast(`Đã dịch & thêm nhanh từ: "${result.word}" (${result.meaning})!`, 'success');
    
    updateStatsUI();
    renderVocabList();
  } catch (err) {
    showToast(`Lỗi thêm nhanh: ${err.message}`, 'error');
    console.error(err);
  } finally {
    loadingIndicator.style.display = 'none';
    addBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }
}

function saveVocabForm() {
  const id = document.getElementById('vocab-edit-id').value;
  const word = document.getElementById('vocab-input-word').value.trim();
  const ipa = document.getElementById('vocab-input-ipa').value.trim();
  const type = document.getElementById('vocab-input-type').value;
  const meaning = document.getElementById('vocab-input-meaning').value.trim();
  const meaningCn = document.getElementById('vocab-input-meaning-cn').value.trim();
  const definition = document.getElementById('vocab-input-definition').value.trim();
  const exampleEn = document.getElementById('vocab-input-example-en').value.trim();
  const exampleVi = document.getElementById('vocab-input-example-vi').value.trim();
  const exampleCn = document.getElementById('vocab-input-example-cn').value.trim();
  const tip = document.getElementById('vocab-input-tip').value.trim();

  if (!word || !meaning) {
    showToast('Vui lòng nhập từ tiếng Anh và nghĩa tiếng Việt.', 'warning');
    return;
  }

  const wordObj = { word, ipa, type, meaning, meaningCn, definition, exampleEn, exampleVi, exampleCn, tip };

  try {
    if (id) {
      // Editing
      currentWords = updateWord(id, wordObj);
      showToast(`Đã cập nhật từ "${word}"`, 'success');
    } else {
      // Adding
      const newWord = addWord(wordObj);
      currentWords.unshift(newWord);
      showToast(`Đã thêm từ mới "${word}"`, 'success');
    }
    
    updateStatsUI();
    renderVocabList();
    closeVocabModal();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// --- Flashcards Logic ---
function initFlashcards() {
  const cardElement = document.getElementById('flashcard');
  if (cardElement) {
    cardElement.classList.remove('is-flipped');
  }

  // Filter words that are marked as 'learning' (or all words if no learning words)
  const allWords = getWords();
  flashcardList = allWords.filter(w => w.status === 'learning');
  
  if (flashcardList.length === 0 && allWords.length > 0) {
    // If all are mastered, load all of them for practice
    flashcardList = allWords;
  }

  const fcContainer = document.querySelector('.flashcards-container');
  const fcEmpty = document.getElementById('fc-empty');

  if (flashcardList.length === 0) {
    fcContainer.style.display = 'none';
    fcEmpty.style.display = 'flex';
    return;
  }

  fcContainer.style.display = 'flex';
  fcEmpty.style.display = 'none';

  currentFlashcardIndex = 0;
  showFlashcard();
}

function showFlashcard() {
  if (flashcardList.length === 0) return;
  
  const w = flashcardList[currentFlashcardIndex];
  
  // Reset flipped state
  document.getElementById('flashcard').classList.remove('is-flipped');

  // Load front data
  document.getElementById('fc-word').innerText = w.word;
  document.getElementById('fc-ipa').innerText = w.ipa || '';
  document.getElementById('fc-type').innerText = w.type || 'Noun';

  // Load back data
  document.getElementById('fc-back-type').innerText = w.type || 'Noun';
  document.getElementById('fc-meaning').innerText = w.meaning;
  document.getElementById('fc-definition').innerText = w.definition || 'Chưa có định nghĩa tiếng Anh.';
  document.getElementById('fc-example-en').innerText = w.exampleEn || '';
  document.getElementById('fc-example-vi').innerText = w.exampleVi || '';

  // Update progress bar
  const progressFill = document.getElementById('card-progress-fill');
  const percent = ((currentFlashcardIndex + 1) / flashcardList.length) * 100;
  progressFill.style.style = `width: ${percent}%`; // Fix for direct DOM styling
  progressFill.style.width = `${percent}%`;

  // Bind speak button in front card
  const speakBtn = document.getElementById('fc-speak');
  // Remove existing listeners to avoid stacking
  const newSpeakBtn = speakBtn.cloneNode(true);
  speakBtn.parentNode.replaceChild(newSpeakBtn, speakBtn);
  newSpeakBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Avoid flipping card
    speakText(w.word);
  });
}

function flipFlashcard() {
  document.getElementById('flashcard').classList.toggle('is-flipped');
}

function handleFlashcardStatus(status) {
  const currentCard = flashcardList[currentFlashcardIndex];
  if (!currentCard) return;

  // Update in DB
  currentWords = updateWordStatus(currentCard.id, status);
  updateStatsUI();

  showToast(`Từ "${currentCard.word}" đã được đánh dấu là ${status === 'mastered' ? 'Đã thuộc' : 'Cần học lại'}.`, 'success');

  // Go to next card
  nextFlashcard();
}

function nextFlashcard() {
  if (flashcardList.length === 0) return;
  currentFlashcardIndex = (currentFlashcardIndex + 1) % flashcardList.length;
  showFlashcard();
}

function prevFlashcard() {
  if (flashcardList.length === 0) return;
  currentFlashcardIndex = (currentFlashcardIndex - 1 + flashcardList.length) % flashcardList.length;
  showFlashcard();
}

// --- AI Chat Logic ---
function initChatScroll() {
  const container = document.getElementById('chat-messages');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

function loadChatHistory() {
  const user = getActiveUser();
  const key = user ? `vibe_english_chat_history_${user}` : 'vibe_english_chat_history';
  const history = localStorage.getItem(key);
  if (history) {
    try {
      chatHistory = JSON.parse(history);
      renderChatMessages();
    } catch (e) {
      console.error(e);
      chatHistory = [];
    }
  } else {
    chatHistory = [];
    renderChatMessages();
  }
}

function saveChatHistory() {
  const user = getActiveUser();
  const key = user ? `vibe_english_chat_history_${user}` : 'vibe_english_chat_history';
  localStorage.setItem(key, JSON.stringify(chatHistory));
}

function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  // Clear except first welcome message
  const welcomeHtml = `
    <div class="message-wrapper ai">
      <div class="message-bubble">
        Hello! I'm <strong>Aura</strong>, your personal AI English tutor. How can I help you today? We can practice speaking, translate text, write essays, or explain complex English grammar. 
        <br><br>
        <em>Chào bạn! Mình là Aura, gia sư tiếng Anh của bạn. Hôm nay bạn muốn luyện tập điều gì? Bạn cứ thoải mái trò chuyện bằng tiếng Anh hoặc hỏi đáp ngữ pháp nhé!</em>
      </div>
      <div class="message-meta">
        <button class="speech-btn-chat" data-text="Hello! I'm Aura, your personal AI English tutor. How can I help you today?"><i class="fa-solid fa-volume-high"></i> Đọc câu này</button>
      </div>
    </div>
  `;
  
  container.innerHTML = welcomeHtml;

  chatHistory.forEach(msg => {
    const isUser = msg.role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isUser ? 'user' : 'ai'}`;

    let parsedText = msg.parts[0].text;
    
    // Simple markdown formatting replacement for beautiful rendering
    if (!isUser) {
      // Replace headers, list bullets, bold texts, and newlines
      parsedText = parsedText
        .replace(/💡 Sửa lỗi \(Corrections\)/g, '<strong style="color: var(--color-warning); display:block; margin-top:8px;"><i class="fa-solid fa-lightbulb"></i> 💡 Sửa lỗi (Corrections):</strong>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code style="background: rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; font-family: monospace;">$1</code>')
        .replace(/\n/g, '<br>');
    } else {
      parsedText = parsedText.replace(/\n/g, '<br>');
    }

    wrapper.innerHTML = `
      <div class="message-bubble">
        ${parsedText}
      </div>
      <div class="message-meta">
        ${!isUser ? `<button class="speech-btn-chat" data-text="${msg.parts[0].text.replace(/"/g, '&quot;')}"><i class="fa-solid fa-volume-high"></i> Đọc câu này</button>` : 'Bạn'}
      </div>
    `;

    container.appendChild(wrapper);
  });

  // Bind speak button actions
  container.querySelectorAll('.speech-btn-chat').forEach(btn => {
    btn.onclick = (e) => {
      const text = e.currentTarget.getAttribute('data-text');
      speakText(text);
    };
  });

  initChatScroll();
}

async function handleSendMessage() {
  const inputEl = document.getElementById('chat-input');
  const message = inputEl.value.trim();

  if (!message) return;

  if (!isApiConfigured()) {
    showToast('Chưa cấu hình Gemini API Key. Hãy cấu hình ở trang Cài đặt.', 'error');
    return;
  }

  // Add User Message
  chatHistory.push({
    role: 'user',
    parts: [{ text: message }]
  });
  saveChatHistory();
  renderChatMessages();

  // Clear Input
  inputEl.value = '';
  inputEl.focus();

  // Add AI Typing Indicator
  const container = document.getElementById('chat-messages');
  const typingWrapper = document.createElement('div');
  typingWrapper.className = 'message-wrapper ai';
  typingWrapper.id = 'ai-typing-indicator';
  typingWrapper.innerHTML = `
    <div class="message-bubble">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  container.appendChild(typingWrapper);
  initChatScroll();

  document.getElementById('chat-status-text').innerText = 'Aura đang gõ...';

  try {
    // Call Gemini chat
    // Limit history length to prevent token overflow
    const historyLimit = chatHistory.slice(-8, -1); // Keep last 3 exchanges (6 messages)
    const reply = await chatWithTutor(message, historyLimit);

    // Remove Typing Indicator
    const indicator = document.getElementById('ai-typing-indicator');
    if (indicator) indicator.remove();

    // Add Model Message
    chatHistory.push({
      role: 'model',
      parts: [{ text: reply }]
    });
    
    saveChatHistory();
    renderChatMessages();
    
    // Auto speak the first sentence or two of AI response for better immersion
    const firstSentence = reply.split(/[.!?]/)[0];
    if (firstSentence && firstSentence.length > 5) {
      speakText(firstSentence);
    }

  } catch (err) {
    const indicator = document.getElementById('ai-typing-indicator');
    if (indicator) indicator.remove();
    showToast(err.message, 'error');
  } finally {
    document.getElementById('chat-status-text').innerText = 'Đang hoạt động';
  }
}

// --- Settings Logic ---
function initSettingsView() {
  const apiKey = getApiKey();
  const model = getGeminiModel();
  
  document.getElementById('setting-api-key').value = apiKey;
  document.getElementById('setting-gemini-model').value = model;

  // Load range values
  const rate = localStorage.getItem('vibe_english_tts_rate') || '0.9';
  const volume = localStorage.getItem('vibe_english_tts_volume') || '0.9';

  document.getElementById('setting-tts-rate').value = rate;
  document.getElementById('tts-rate-val').innerText = `${rate}x`;

  document.getElementById('setting-tts-volume').value = volume;
  document.getElementById('tts-volume-val').innerText = volume;

  updateApiStatusIndicator(!!apiKey);
}

function updateApiStatusIndicator(active) {
  const indicator = document.getElementById('api-status-indicator');
  const banner = document.getElementById('api-warning-banner');

  if (active) {
    indicator.className = 'api-badge active';
    indicator.innerHTML = '<i class="fa-solid fa-circle"></i> Đã kết nối';
    banner.style.display = 'none';
  } else {
    indicator.className = 'api-badge inactive';
    indicator.innerHTML = '<i class="fa-solid fa-circle"></i> Chưa cấu hình';
    banner.style.display = 'block';
  }
}

async function handleSaveSettings() {
  const keyInput = document.getElementById('setting-api-key');
  const key = keyInput.value.trim();
  const model = document.getElementById('setting-gemini-model').value;

  if (!key) {
    saveApiKey('');
    updateApiStatusIndicator(false);
    showToast('Đã xóa API Key. Ứng dụng sẽ hoạt động ở chế độ Offline.', 'info');
    return;
  }

  showToast('Đang kiểm tra kết nối với API Key...', 'info');

  try {
    await testApiKey(key);
    saveApiKey(key);
    saveGeminiModel(model);
    updateApiStatusIndicator(true);
    showToast('Cấu hình API Key thành công và hoạt động tốt!', 'success');
  } catch (err) {
    showToast(`Kiểm tra API thất bại: ${err.message}`, 'error');
  }
}

function handleExportData() {
  const dataStr = exportData();
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  
  const exportFileDefaultName = `vibe_english_export_${Date.now()}.json`;
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
  showToast('Đã xuất dữ liệu thành công!', 'success');
}

function handleImportData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const result = importData(event.target.result);
      currentWords = getWords();
      updateStatsUI();
      renderVocabList();
      showToast(`Đã nhập dữ liệu thành công! Thêm mới: ${result.addedCount}, Cập nhật: ${result.updatedCount}`, 'success');
      // Reset file input
      e.target.value = '';
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function handleResetDb() {
  if (confirm('Bạn có chắc chắn muốn xóa toàn bộ dữ liệu hiện tại và khôi phục dữ liệu mẫu?')) {
    const user = getActiveUser();
    const key = user ? `vibe_english_vocab_list_${user}` : 'vibe_english_vocab_list';
    localStorage.removeItem(key);
    currentWords = loadMockDataIfEmpty();
    updateStatsUI();
    renderVocabList();
    showToast('Đã khôi phục dữ liệu mẫu thành công.', 'info');
  }
}

// --- AI Topic Generator Logic ---
let generatedTopicWords = [];

function initTopicsView() {
  document.getElementById('topic-input').value = '';
  document.getElementById('topic-words-list').style.display = 'none';
  document.getElementById('topic-loading').style.display = 'none';
  document.getElementById('topic-input').focus();
}

async function handleGenerateTopicWords() {
  const topicInput = document.getElementById('topic-input');
  const topic = topicInput.value.trim();

  if (!topic) {
    showToast('Vui lòng nhập chủ đề học.', 'warning');
    topicInput.focus();
    return;
  }

  if (!isApiConfigured()) {
    showToast('Chưa cấu hình Gemini API Key. Hãy cấu hình ở trang Cài đặt.', 'error');
    return;
  }

  const loadingIndicator = document.getElementById('topic-loading');
  const generateBtn = document.getElementById('btn-generate-topic');
  const listContainer = document.getElementById('topic-words-list');

  loadingIndicator.style.display = 'flex';
  listContainer.style.display = 'none';
  generateBtn.disabled = true;
  topicInput.disabled = true;

  try {
    const results = await generateWordsByTopic(topic);
    generatedTopicWords = results;
    renderTopicWords();
    showToast(`Đã tạo thành công 5 từ vựng cho chủ đề "${topic}"!`, 'success');
  } catch (err) {
    showToast(`Lỗi tạo từ vựng: ${err.message}`, 'error');
    console.error(err);
  } finally {
    loadingIndicator.style.display = 'none';
    generateBtn.disabled = false;
    topicInput.disabled = false;
  }
}

function renderTopicWords() {
  const listContainer = document.getElementById('topic-words-list');
  if (!listContainer) return;

  listContainer.innerHTML = '';
  listContainer.style.display = 'grid';

  generatedTopicWords.forEach((w, index) => {
    const card = document.createElement('div');
    
    // Check if word is already in notebook
    const isSaved = currentWords.some(item => item.word.toLowerCase().trim() === w.word.toLowerCase().trim());
    
    card.className = `word-card ${isSaved ? 'card-mastered' : ''}`;
    
    card.innerHTML = `
      <div class="card-header">
        <div class="card-title-group">
          <h3 class="card-word">${w.word}</h3>
          <span class="card-ipa">${w.ipa || ''}</span>
        </div>
        <div class="card-badges">
          <span class="badge badge-type">${w.type || 'Noun'}</span>
          <span class="badge badge-status ${isSaved ? 'mastered' : 'learning'}" style="cursor: default;">
            ${isSaved ? 'Đã lưu' : 'Gợi ý'}
          </span>
        </div>
      </div>
      
      <div class="card-meaning">
        <strong>Việt:</strong> ${w.meaning}
        <div class="card-meaning-cn" style="font-size: 14px; color: var(--color-secondary); margin-top: 4px;">
          <strong>Trung:</strong> ${w.meaningCn}
        </div>
      </div>
      
      ${w.definition ? `<div class="card-definition">${w.definition}</div>` : ''}
      
      ${w.exampleEn ? `
        <div class="card-example">
          <span class="example-en">${w.exampleEn}</span>
          <span class="example-vi">${w.exampleVi || ''}</span>
          <span class="example-cn" style="display: block; font-size: 13px; color: var(--color-secondary); margin-top: 2px;">${w.exampleCn}</span>
        </div>
      ` : ''}
      
      ${w.tip ? `
        <div class="card-tip">
          <i class="fa-solid fa-lightbulb"></i>
          <span>${w.tip}</span>
        </div>
      ` : ''}
      
      <div class="card-actions" style="margin-top: 15px;">
        <button class="btn btn-primary btn-save-topic-word" data-index="${index}" ${isSaved ? 'disabled style="background: var(--color-border); border-color: var(--color-border);"' : ''} style="width: 100%; justify-content: center; height: 36px;">
          <i class="fa-solid ${isSaved ? 'fa-circle-check' : 'fa-floppy-disk'}"></i> 
          <span>${isSaved ? 'Đã lưu vào sổ tay' : 'Lưu vào sổ tay'}</span>
        </button>
      </div>
    `;

    // Save button event listener
    if (!isSaved) {
      card.querySelector('.btn-save-topic-word').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        try {
          const newWord = addWord({
            word: w.word,
            ipa: w.ipa || '',
            type: w.type || 'Noun',
            meaning: w.meaning || '',
            meaningCn: w.meaningCn || '',
            definition: w.definition || '',
            exampleEn: w.exampleEn || '',
            exampleVi: w.exampleVi || '',
            exampleCn: w.exampleCn || '',
            tip: w.tip || ''
          });

          // Sync in-memory list
          currentWords.unshift(newWord);
          updateStatsUI();
          renderVocabList();
          
          // Update button UI
          btn.disabled = true;
          btn.style.background = 'var(--color-border)';
          btn.style.borderColor = 'var(--color-border)';
          btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>Đã lưu vào sổ tay</span>';
          card.querySelector('.badge-status').className = 'badge badge-status mastered';
          card.querySelector('.badge-status').innerText = 'Đã lưu';
          
          showToast(`Đã lưu từ "${w.word}" vào sổ tay từ vựng!`, 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    listContainer.appendChild(card);
  });
}

// --- Event Binding ---
function setupEventListeners() {
  // Navigation Routing
  window.addEventListener('hashchange', handleNavigation);
  
  // Modal buttons
  document.getElementById('btn-open-add-modal').addEventListener('click', openAddModal);
  document.getElementById('btn-close-vocab-modal').addEventListener('click', closeVocabModal);
  document.getElementById('btn-cancel-vocab').addEventListener('click', closeVocabModal);
  document.getElementById('btn-save-vocab').addEventListener('click', saveVocabForm);
  document.getElementById('btn-empty-add').addEventListener('click', openAddModal);

  // AI autofill translation inside modal
  document.getElementById('btn-ai-translate').addEventListener('click', handleAiTranslate);

  // Quick Add AI Events
  document.getElementById('btn-quick-add').addEventListener('click', handleQuickAdd);
  document.getElementById('quick-add-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuickAdd();
    }
  });

  // AI Topic Generator Events
  document.getElementById('btn-generate-topic').addEventListener('click', handleGenerateTopicWords);
  document.getElementById('topic-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleGenerateTopicWords();
    }
  });

  // Search input filtering
  document.getElementById('vocab-search').addEventListener('input', (e) => {
    currentSearch = e.target.value;
    renderVocabList();
  });

  // Filter Tab triggers
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.getAttribute('data-filter');
      renderVocabList();
    });
  });

  // Flashcards Flipping & Controls
  document.getElementById('flashcard').addEventListener('click', flipFlashcard);
  document.getElementById('btn-fc-prev').addEventListener('click', prevFlashcard);
  document.getElementById('btn-fc-next').addEventListener('click', nextFlashcard);
  
  document.getElementById('btn-fc-keep').addEventListener('click', () => {
    handleFlashcardStatus('learning');
  });
  
  document.getElementById('btn-fc-master').addEventListener('click', () => {
    handleFlashcardStatus('mastered');
  });

  // Chat send operations
  document.getElementById('btn-send-chat').addEventListener('click', handleSendMessage);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  document.getElementById('btn-clear-chat').addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn xóa lịch sử chat cùng Aura?')) {
      chatHistory = [];
      saveChatHistory();
      renderChatMessages();
      showToast('Đã xóa lịch sử chat.', 'info');
    }
  });

  // Settings Actions
  document.getElementById('btn-save-api').addEventListener('click', handleSaveSettings);
  
  document.getElementById('btn-test-tts').addEventListener('click', () => {
    speakText('Hello! This is a test of your English tutor voice pronunciation speed and quality.');
  });

  // Range Slider settings listeners
  const rateInput = document.getElementById('setting-tts-rate');
  rateInput.addEventListener('input', (e) => {
    localStorage.setItem('vibe_english_tts_rate', e.target.value);
    document.getElementById('tts-rate-val').innerText = `${e.target.value}x`;
  });

  const volInput = document.getElementById('setting-tts-volume');
  volInput.addEventListener('input', (e) => {
    localStorage.setItem('vibe_english_tts_volume', e.target.value);
    document.getElementById('tts-volume-val').innerText = e.target.value;
  });

  // Data Actions
  document.getElementById('btn-export').addEventListener('click', handleExportData);
  
  const importTrigger = document.getElementById('btn-import-trigger');
  const fileInput = document.getElementById('file-import');
  importTrigger.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleImportData);

  document.getElementById('btn-reset-db').addEventListener('click', handleResetDb);
}

// --- Authentication & Session Logic ---
function checkAuth() {
  const activeUser = getActiveUser();
  const authOverlay = document.getElementById('auth-overlay');
  
  if (!activeUser) {
    authOverlay.classList.add('active');
    return false;
  } else {
    authOverlay.classList.remove('active');
    document.getElementById('user-profile-name').innerText = activeUser;
    document.getElementById('settings-username-display').innerText = activeUser;
    return true;
  }
}

function setupAuthListeners() {
  // Toggle between Login and Register
  document.getElementById('link-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'flex';
  });

  document.getElementById('link-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'flex';
  });

  // Handle Login Form Submission
  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    try {
      loginUser(username, password);
      showToast(`Đăng nhập thành công! Chào mừng quay trở lại, ${username}!`, 'success');
      
      // Clear forms
      document.getElementById('login-username').value = '';
      document.getElementById('login-password').value = '';
      
      reloadUserSession();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Handle Register Form Submission
  document.getElementById('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    
    if (password !== confirmPassword) {
      showToast('Mật khẩu xác nhận không trùng khớp!', 'error');
      return;
    }
    
    try {
      registerUser(username, password);
      showToast(`Đăng ký tài khoản thành công! Chào mừng, ${username}!`, 'success');
      
      // Clear forms
      document.getElementById('register-username').value = '';
      document.getElementById('register-password').value = '';
      document.getElementById('register-confirm-password').value = '';
      
      reloadUserSession();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Handle Logout
  const performLogout = () => {
    setActiveUser('');
    currentWords = [];
    chatHistory = [];
    renderVocabList();
    renderChatMessages();
    updateStatsUI();
    showToast('Đã đăng xuất khỏi tài khoản.', 'info');
    checkAuth();
  };

  document.getElementById('btn-logout-sidebar').addEventListener('click', performLogout);
  document.getElementById('btn-logout-settings').addEventListener('click', performLogout);
}

function setupTopicBadgesListeners() {
  document.querySelectorAll('.btn-suggest-topic').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const topic = btn.getAttribute('data-topic');
      const topicInput = document.getElementById('topic-input');
      topicInput.value = topic;
      handleGenerateTopicWords();
    });
  });
}

function reloadUserSession() {
  if (checkAuth()) {
    currentWords = loadMockDataIfEmpty();
    initSettingsView();
    loadChatHistory();
    handleNavigation();
    updateStatsUI();
    renderVocabList();
  }
}

// --- App Initialization ---
function initApp() {
  setupEventListeners();
  setupAuthListeners();
  setupTopicBadgesListeners();

  if (getActiveUser()) {
    reloadUserSession();
    showToast(`Chào mừng bạn quay trở lại, ${getActiveUser()}!`, 'success');
  } else {
    checkAuth();
  }
}

// Start everything when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
// Also trigger if load has already finished
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  initApp();
}
