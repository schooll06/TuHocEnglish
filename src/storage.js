/**
 * LocalStorage Management for VibeEnglish AI
 */

export function getActiveUser() {
  return localStorage.getItem('vibe_english_current_user') || '';
}

export function setActiveUser(username) {
  if (username) {
    localStorage.setItem('vibe_english_current_user', username);
  } else {
    localStorage.removeItem('vibe_english_current_user');
  }
}

export function getUsers() {
  const data = localStorage.getItem('vibe_english_users');
  return data ? JSON.parse(data) : [];
}

export function registerUser(username, password) {
  const users = getUsers();
  const exists = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    throw new Error('Tài khoản này đã tồn tại!');
  }
  users.push({ username, password });
  localStorage.setItem('vibe_english_users', JSON.stringify(users));
  setActiveUser(username);
}

export function loginUser(username, password) {
  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.password !== password) {
    throw new Error('Tên tài khoản hoặc mật khẩu không chính xác!');
  }
  setActiveUser(username);
}

function getStorageKey() {
  const user = getActiveUser();
  return user ? `vibe_english_vocab_list_${user}` : 'vibe_english_vocab_list';
}

/**
 * Get all words, sorted by creation date descending
 */
export function getWords() {
  const key = getStorageKey();
  const data = localStorage.getItem(key);
  if (!data) return [];
  try {
    const list = JSON.parse(data);
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (e) {
    console.error('Lỗi phân tích cú pháp từ vựng:', e);
    return [];
  }
}

/**
 * Save all words
 */
export function saveWords(words) {
  const key = getStorageKey();
  localStorage.setItem(key, JSON.stringify(words));
}

/**
 * Add a new word
 * @param {Object} wordObj - The word data object
 */
export function addWord(wordObj) {
  const words = getWords();
  
  // Clean word spelling for duplicate check
  const newWordClean = wordObj.word.trim().toLowerCase();
  const exists = words.find(w => w.word.trim().toLowerCase() === newWordClean);
  
  if (exists) {
    throw new Error(`Từ "${wordObj.word}" đã tồn tại trong danh sách của bạn.`);
  }

  const newWord = {
    id: 'word_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    status: 'learning',
    createdAt: new Date().toISOString(),
    ...wordObj
  };

  words.unshift(newWord);
  saveWords(words);
  return newWord;
}

/**
 * Delete a word by id
 */
export function deleteWord(id) {
  const words = getWords();
  const filtered = words.filter(w => w.id !== id);
  saveWords(filtered);
  return filtered;
}

/**
 * Update the learning status of a word
 */
export function updateWordStatus(id, status) {
  const words = getWords();
  const index = words.findIndex(w => w.id === id);
  if (index !== -1) {
    words[index].status = status; // 'learning' | 'mastered'
    saveWords(words);
  }
  return words;
}

/**
 * Update entire word properties
 */
export function updateWord(id, updatedFields) {
  const words = getWords();
  const index = words.findIndex(w => w.id === id);
  if (index !== -1) {
    words[index] = { ...words[index], ...updatedFields };
    saveWords(words);
  }
  return words;
}

/**
 * Get statistics of words
 */
export function getStats() {
  const words = getWords();
  const total = words.length;
  const mastered = words.filter(w => w.status === 'mastered').length;
  const learning = total - mastered;
  
  return {
    total,
    mastered,
    learning,
    masteryRate: total > 0 ? Math.round((mastered / total) * 100) : 0
  };
}

/**
 * Import database
 */
export function importData(jsonString) {
  try {
    const imported = JSON.parse(jsonString);
    if (!Array.isArray(imported)) {
      throw new Error('Dữ liệu không phải là danh sách hợp lệ.');
    }
    
    // Simple verification
    const verified = imported.filter(item => item && item.word && item.meaning);
    if (verified.length === 0 && imported.length > 0) {
      throw new Error('Không tìm thấy từ vựng hợp lệ để nhập.');
    }

    const currentWords = getWords();
    const currentMap = new Map(currentWords.map(w => [w.word.toLowerCase().trim(), w]));

    let addedCount = 0;
    let updatedCount = 0;

    verified.forEach(item => {
      const cleanWord = item.word.toLowerCase().trim();
      if (currentMap.has(cleanWord)) {
        // Update existing
        const existing = currentMap.get(cleanWord);
        Object.assign(existing, {
          ipa: item.ipa || existing.ipa || '',
          type: item.type || existing.type || 'Noun',
          meaning: item.meaning || existing.meaning,
          definition: item.definition || existing.definition || '',
          exampleEn: item.exampleEn || existing.exampleEn || '',
          exampleVi: item.exampleVi || existing.exampleVi || '',
          tip: item.tip || existing.tip || '',
          status: item.status || existing.status || 'learning'
        });
        updatedCount++;
      } else {
        // Add new
        currentWords.push({
          id: item.id || 'word_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          word: item.word.trim(),
          ipa: item.ipa || '',
          type: item.type || 'Noun',
          meaning: item.meaning.trim(),
          definition: item.definition || '',
          exampleEn: item.exampleEn || '',
          exampleVi: item.exampleVi || '',
          tip: item.tip || '',
          status: item.status || 'learning',
          createdAt: item.createdAt || new Date().toISOString()
        });
        addedCount++;
      }
    });

    saveWords(currentWords);
    return { addedCount, updatedCount };
  } catch (e) {
    throw new Error('Lỗi nhập dữ liệu: ' + e.message);
  }
}

/**
 * Export database as JSON string
 */
export function exportData() {
  const words = getWords();
  return JSON.stringify(words, null, 2);
}

/**
 * Load initial mock data if list is empty
 */
export function loadMockDataIfEmpty() {
  const words = getWords();
  if (words.length > 0) return words;

  const mockWords = [
    {
      word: 'Resilience',
      ipa: '/rɪˈzɪl.jəns/',
      type: 'Noun',
      meaning: 'Sự kiên cường, khả năng phục hồi',
      definition: 'The capacity to recover quickly from difficulties; toughness.',
      exampleEn: 'Her resilience in face of failure was inspiring to everyone.',
      exampleVi: 'Sự kiên cường của cô ấy đối mặt với thất bại đã truyền cảm hứng cho mọi người.',
      tip: 'Hãy liên tưởng đến hình ảnh quả bóng cao su nảy lại sau khi bị nén xuống.',
      status: 'learning',
    },
    {
      word: 'Acquire',
      ipa: '/əˈkwaɪər/',
      type: 'Verb',
      meaning: 'Đạt được, thu nhận được (kiến thức, kỹ năng)',
      definition: 'To buy or obtain an asset or object, or to learn a skill.',
      exampleEn: 'It takes time to acquire a new language naturally.',
      exampleVi: 'Phải mất thời gian để tiếp thu một ngôn ngữ mới một cách tự nhiên.',
      tip: 'Từ này rất giống với từ "get" hoặc "learn", nhưng trang trọng hơn.',
      status: 'learning',
    },
    {
      word: 'Magnificent',
      ipa: '/mæɡˈnɪf.ɪ.sənt/',
      type: 'Adjective',
      meaning: 'Tráng lệ, nguy nga, lộng lẫy',
      definition: 'Extremely beautiful, elaborate, or impressive.',
      exampleEn: 'The palace has a magnificent view of the entire valley.',
      exampleVi: 'Cung điện có một tầm nhìn tráng lệ ra toàn bộ thung lũng.',
      tip: 'Bắt đầu bằng "magni-" nghĩa là lớn lao (như magnify - phóng đại).',
      status: 'mastered',
    }
  ];

  mockWords.forEach(w => {
    w.id = 'word_mock_' + Math.random().toString(36).substr(2, 9);
    w.createdAt = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(); // 1 day ago
  });

  saveWords(mockWords);
  return mockWords;
}
