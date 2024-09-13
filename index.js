const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');

// Token del bot
const token = '7221787026:AAFTsZMtpKOXy-e-XzICCh_ZxhLFcIDZ308';

// Crear el bot
const bot = new TelegramBot(token, { polling: true });

// Credenciales de Google Custom Search API
const googleApiKey = 'AIzaSyBaeEYhHa20VJQvrvJrVHTPbAqRdbpIl90';  // Reemplaza con tu clave API de Google
const searchEngineId = '24ca0546b4bfd475a';  // Reemplaza con tu ID de motor de búsqueda

// Función para buscar en Wikipedia
const searchWikipedia = async (query) => {
  try {
    const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const response = await axios.get(url);
    if (response.data.extract) {
      return {
        extract: response.data.extract,
        fullUrl: response.data.content_urls.desktop.page
      };
    } else {
      return { extract: 'No se encontró información en Wikipedia.', fullUrl: '' };
    }
  } catch (error) {
    return { extract: 'Error al buscar en Wikipedia.', fullUrl: '' };
  }
};

// Función para buscar en Concepto.com
const searchConcepto = async (query) => {
  try {
    const url = `https://concepto.de/${encodeURIComponent(query)}`;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Extraer el primer párrafo de la página
    const extract = $('p').first().text();
    return {
      extract: extract || 'No se encontró información en Concepto.com.',
      fullUrl: url
    };
  } catch (error) {
    return { extract: 'No se encontró información en Concepto.com.', fullUrl: '' };
  }
};

// Función que combina Wikipedia y Concepto.com
const searchAllSources = async (query) => {
  const wikipediaResult = await searchWikipedia(query);
  const conceptoResult = await searchConcepto(query);

  let results = [];
  if (wikipediaResult.extract !== 'No se encontró información en Wikipedia.') {
    results.push({
      title: 'Wikipedia',
      extract: wikipediaResult.extract,
      fullUrl: wikipediaResult.fullUrl
    });
  }
  if (conceptoResult.extract !== 'No se encontró información en Concepto.com.') {
    results.push({
      title: 'Concepto.com',
      extract: conceptoResult.extract,
      fullUrl: conceptoResult.fullUrl
    });
  }

  return results;
};

// Función para buscar en Google
const searchGoogle = async (query) => {
  try {
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${googleApiKey}&cx=${searchEngineId}`;
    const response = await axios.get(url);
    
    // Extraer títulos y enlaces de los resultados
    const results = response.data.items.map(item => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet
    }));

    return results;
  } catch (error) {
    return 'Error al buscar en Google.';
  }
};

// Manejar el comando /wiki
bot.onText(/\/wiki (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];  // El término de búsqueda

  const results = await searchAllSources(query);

  if (results.length === 0) {
    return bot.sendMessage(chatId, 'No se encontraron resultados.');
  }

  // Enviar los resultados como botones inline
  const options = {
    reply_markup: {
      inline_keyboard: results.map((result, index) => [{
        text: `${result.title} - Ver más`,
        callback_data: `result_${index}`
      }])
    }
  };

  bot.sendMessage(chatId, 'Resultados encontrados:', options);

  // Guardar resultados en contexto para uso posterior
  bot.resultCache = results;
});

// Manejar la selección de resultados
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const resultIndex = parseInt(query.data.replace('result_', ''), 10);

  if (isNaN(resultIndex) || !bot.resultCache || resultIndex >= bot.resultCache.length) {
    return bot.answerCallbackQuery(query.id, { text: 'Resultado no válido.' });
  }

  const result = bot.resultCache[resultIndex];
  const message = `${result.extract}\n\nMás información: ${result.fullUrl}`;

  bot.answerCallbackQuery(query.id); // Acknowledge the callback query
  bot.sendMessage(chatId, message);
});

// Manejar el comando /search
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];  // El término de búsqueda

  const results = await searchGoogle(query);

  if (results.length === 0) {
    return bot.sendMessage(chatId, 'No se encontraron resultados en Google.');
  }

  // Enviar los resultados encontrados
  const message = results.map((result, index) => `${index + 1}. ${result.title}\n${result.snippet}\n${result.link}`).join('\n\n');
  bot.sendMessage(chatId, message);
});

// Mensaje para cuando no se proporciona un término de búsqueda
bot.onText(/\/wiki$/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Por favor, proporciona un término de búsqueda. Ejemplo: /wiki elefante');
});

bot.onText(/\/search$/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Por favor, proporciona un término de búsqueda. Ejemplo: /search libro');
});

// Mensaje de inicio
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (msg.text.toString().toLowerCase() === '/start') {
    bot.sendMessage(chatId, 'Hola, soy Fungus. Usa /wiki para buscar información en Wikipedia y Concepto.com o /search para buscar en Google.');
  }
});
