/**
 * Gemini API Integration for VibeEnglish AI
 */

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_KEY = '';

/**
 * Get the API Key from localStorage or environment
 */
export function getApiKey() {
  const user = localStorage.getItem('vibe_english_current_user') || '';
  const keyName = user ? `vibe_english_gemini_key_${user}` : 'vibe_english_gemini_key';
  return localStorage.getItem(keyName) || import.meta.env.VITE_GEMINI_API_KEY || DEFAULT_KEY;
}

/**
 * Save the API Key to localStorage
 */
export function saveApiKey(key) {
  const user = localStorage.getItem('vibe_english_current_user') || '';
  const keyName = user ? `vibe_english_gemini_key_${user}` : 'vibe_english_gemini_key';
  localStorage.setItem(keyName, key.trim());
}

/**
 * Get the preferred Gemini model
 */
export function getGeminiModel() {
  const user = localStorage.getItem('vibe_english_current_user') || '';
  const modelName = user ? `vibe_english_gemini_model_${user}` : 'vibe_english_gemini_model';
  return localStorage.getItem(modelName) || DEFAULT_MODEL;
}

/**
 * Save the preferred Gemini model
 */
export function saveGeminiModel(model) {
  const user = localStorage.getItem('vibe_english_current_user') || '';
  const modelName = user ? `vibe_english_gemini_model_${user}` : 'vibe_english_gemini_model';
  localStorage.setItem(modelName, model);
}

/**
 * Check if the Gemini API Key is configured
 */
export function isApiConfigured() {
  return !!getApiKey();
}

/**
 * Call Gemini API to generate content
 */
async function callGemini(prompt, systemInstruction = '', jsonSchema = null) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Chưa cấu hình Gemini API Key. Vui lòng vào Cài đặt để thiết lập.');
  }

  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ]
  };

  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  if (jsonSchema) {
    requestBody.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema: jsonSchema
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || response.statusText;
    throw new Error(`Lỗi API: ${errorMessage}`);
  }

  const data = await response.json();
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!textResponse) {
    throw new Error('API không trả về kết quả hợp lệ.');
  }

  return textResponse;
}

/**
 * Test the Gemini API Key
 */
export async function testApiKey(key) {
  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Hello, respond with OK.' }] }]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'API Key không hợp lệ hoặc không có quyền truy cập.');
  }
  return true;
}

/**
 * Translate and analyze a word (supports English or Vietnamese inputs, and adds Chinese translation)
 * @param {string} inputWord - The word/phrase to translate (English or Vietnamese)
 */
export async function translateWord(inputWord) {
  const prompt = `Translate, analyze and define the word or phrase: "${inputWord}". Determine if it is English or Vietnamese, and return the structured JSON output.`;
  
  const systemInstruction = `You are a helpful and expert English and Chinese tutor for Vietnamese learners.
Your task is to analyze the given word or phrase and output details including:
1. Phonetic transcription (IPA)
2. Part of speech
3. Vietnamese translation
4. Chinese translation (simplified characters + Pinyin in brackets, e.g. 韧性 (rènxìng))
5. Simple English definition
6. One natural English example sentence
7. Translation of the example sentence in Vietnamese
8. Translation of the example sentence in Chinese (simplified characters + Pinyin in brackets)
9. A mnemonic/tip in Vietnamese to help the user remember the word (max 2 sentences)

CRITICAL INSTRUCTION FOR INPUT LANGUAGE:
1. If the input is an English word (e.g., "accomplish"), analyze that word directly. Output the word itself in the "word" field.
2. If the input is in Vietnamese (e.g., "hoàn thành" or "kiên cường"), you MUST translate it to the most appropriate, common, and useful English vocabulary word (e.g., "accomplish" or "resilient"). Output the translated English word in the "word" field, the user's original Vietnamese meaning in the "meaning" field, and provide all other fields based on the translated English word.`;

  const jsonSchema = {
    type: 'OBJECT',
    properties: {
      word: { type: 'STRING', description: 'The English word (capitalized normally, e.g. accomplish, resilience)' },
      ipa: { type: 'STRING', description: 'Phonetic symbol, e.g. /əˈkʌm.plɪʃ/ or /bʊk/' },
      type: { type: 'STRING', description: 'Part of speech, e.g. Verb, Noun, Adjective, Adverb' },
      meaning: { type: 'STRING', description: 'Short and clear translation/meanings in Vietnamese' },
      meaningCn: { type: 'STRING', description: 'Short and clear translation/meanings in Chinese (Simplified characters and Pinyin in brackets, e.g. 获得 (huòdé))' },
      definition: { type: 'STRING', description: 'Simple definition in English' },
      exampleEn: { type: 'STRING', description: 'Example sentence in English using the word' },
      exampleVi: { type: 'STRING', description: 'Translation of the example sentence in Vietnamese' },
      exampleCn: { type: 'STRING', description: 'Translation of the example sentence in Chinese (Simplified characters and Pinyin in brackets)' },
      tip: { type: 'STRING', description: 'A mnemonic, root word explanation, or a helpful tip in Vietnamese to remember this word (max 2 sentences)' }
    },
    required: ['word', 'ipa', 'type', 'meaning', 'meaningCn', 'definition', 'exampleEn', 'exampleVi', 'exampleCn', 'tip']
  };

  const responseText = await callGemini(prompt, systemInstruction, jsonSchema);
  return JSON.parse(responseText);
}

/**
 * Generate 5 vocabulary words related to a topic (supports Chinese and Vietnamese)
 * @param {string} topic - The topic to generate words for (e.g. Travel, Business)
 */
export async function generateWordsByTopic(topic) {
  const prompt = `Generate a list of 5 useful and common English vocabulary words or phrases related to the topic: "${topic}". Provide translations, definition, example sentence, and mnemonics.`;
  
  const systemInstruction = `You are a helpful and expert English and Chinese tutor.
Your task is to generate 5 most common, useful, and practical English vocabulary words or phrases related to the user's requested topic.
For each vocabulary item, you must provide:
1. The English word itself
2. IPA phonetic spelling
3. Part of speech (type)
4. Vietnamese meaning (translation)
5. Chinese meaning (simplified characters + Pinyin in brackets, e.g. 餐厅 (cāntīng))
6. English definition
7. English example sentence
8. Example sentence translation in Vietnamese
9. Example sentence translation in Chinese (simplified characters + Pinyin in brackets)
10. A helpful tip or mnemonic in Vietnamese to remember this word

Return the output strictly as a JSON array of objects.`;

  const jsonSchema = {
    type: 'ARRAY',
    description: 'List of vocabulary words related to the topic',
    items: {
      type: 'OBJECT',
      properties: {
        word: { type: 'STRING', description: 'The English word' },
        ipa: { type: 'STRING', description: 'Phonetic symbol, e.g. /əˈkʌm.plɪʃ/' },
        type: { type: 'STRING', description: 'Part of speech, e.g. Noun, Verb, Adjective, Adverb' },
        meaning: { type: 'STRING', description: 'Translation/meanings in Vietnamese' },
        meaningCn: { type: 'STRING', description: 'Translation/meanings in Chinese (Simplified characters and Pinyin in brackets)' },
        definition: { type: 'STRING', description: 'Simple definition in English' },
        exampleEn: { type: 'STRING', description: 'Example sentence in English using the word' },
        exampleVi: { type: 'STRING', description: 'Translation of the example sentence in Vietnamese' },
        exampleCn: { type: 'STRING', description: 'Translation of the example sentence in Chinese (Simplified characters and Pinyin in brackets)' },
        tip: { type: 'STRING', description: 'A mnemonic, root word explanation, or a helpful tip in Vietnamese to remember this word (max 2 sentences)' }
      },
      required: ['word', 'ipa', 'type', 'meaning', 'meaningCn', 'definition', 'exampleEn', 'exampleVi', 'exampleCn', 'tip']
    }
  };

  const responseText = await callGemini(prompt, systemInstruction, jsonSchema);
  return JSON.parse(responseText);
}

/**
 * Chat with the AI tutor
 * @param {string} message - User's message
 * @param {Array} history - Previous message history: [{role: 'user'|'model', parts: [{text: string}]}]
 */
export async function chatWithTutor(message, history = []) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Chưa cấu hình Gemini API Key. Vui lòng vào Cài đặt để thiết lập.');
  }

  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemInstruction = `You are "Aura", a warm, encouraging, and highly professional English and Chinese Tutor.
You assist Vietnamese learners in practicing their English and Chinese.
Guidelines:
1. Always respond in a mix of English, Chinese, and Vietnamese: write clear English and Chinese sentences, and explain complex words or summarize key takeaways in Vietnamese.
2. If the user makes grammatical, spelling, or usage mistakes in English or Chinese, gently point them out and show how to say it more naturally under a small sections labeled "💡 Sửa lỗi (Corrections)" using markdown.
3. Keep your replies concise, friendly, and conversational (100-200 words).
4. Ask open-ended questions at the end to keep the conversation going.
5. Use markdown for beautiful formatting.`;

  // Construct contents with system instruction and history
  const contents = [...history];
  contents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const requestBody = {
    contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || response.statusText);
  }

  const data = await response.json();
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!textResponse) {
    throw new Error('Không nhận được câu trả lời từ AI.');
  }

  return textResponse;
}
