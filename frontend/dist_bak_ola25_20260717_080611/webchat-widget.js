/**
 * JR CHATEAM WebChat Widget
 * Widget embebible para sitios web
 *
 * Uso:
 * <script>
 *   (function(w,d,s,o,f,js,fjs){
 *     w['ChatWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
 *     js=d.createElement(s),fjs=d.getElementsByTagName(s)[0];
 *     js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
 *   }(window,document,'script','cw','https://tu-dominio.com/webchat-widget.js'));
 *   cw('init', { apiKey: 'wgt_xxxxx' });
 * </script>
 */

(function(window, document) {
  'use strict';

  // Configuración por defecto. Puede sobreescribirse con cw('init', { backendUrl }).
  var BACKEND_URL = window.CHATEAM_WEBCHAT_BACKEND_URL || 'https://appro.chateam.ws';

  var config = null;
	  var sessionId = null;
	  var widgetInitialized = false;
	  var lastMessageId = 0;
	  var pollingTimer = null;
	  var displayedMessageIds = {};

  // Procesar cola de comandos
  function processQueue() {
    var cw = window.cw;
    if (cw && cw.q) {
      cw.q.forEach(function(args) {
        var command = args[0];
        var options = args[1];

        if (command === 'init') {
          initWidget(options);
        }
      });
    }

    // Reemplazar función para comandos futuros
    window.cw = function(command, options) {
      if (command === 'init') {
        initWidget(options);
      } else if (command === 'open') {
        openChat();
      } else if (command === 'close') {
        closeChat();
      }
    };
  }

  // Inicializar widget
  function initWidget(options) {
    if (widgetInitialized) return;

    options = options || {};
    var apiKey = options.apiKey;
    if (!apiKey) {
      console.error('WebChat: apiKey es requerido');
      return;
    }

    BACKEND_URL = (options.backendUrl || options.apiUrl || BACKEND_URL).replace(/\/$/, '');

    // Obtener configuración del backend
    fetch(BACKEND_URL + '/webchat/public/config/' + apiKey)
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Widget no encontrado o inactivo');
        }
        return response.json();
      })
      .then(function(data) {
        config = data;
        config.apiKey = apiKey;
        config.backendUrl = BACKEND_URL;

        // Generar session ID
        sessionId = localStorage.getItem('jrchat_session') ||
          'wc_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        localStorage.setItem('jrchat_session', sessionId);

        // Crear widget
        injectStyles();
        createWidget();
        startPolling();

        widgetInitialized = true;

        // Auto-abrir si está configurado
        if (config.autoOpen) {
          setTimeout(openChat, (config.autoOpenDelay || 3) * 1000);
        }
      })
      .catch(function(error) {
        console.error('WebChat Error:', error.message);
      });
  }

  // Inyectar estilos CSS
  function injectStyles() {
    var primaryColor = config.primaryColor || '#2196F3';
    var position = config.position || 'bottom-right';
    var size = config.size || 'medium';
    var borderRadius = config.borderRadius || 16;
    // Imagen del botón: logo por defecto para TODOS los widgets; sobreescribible por-widget con config.buttonImage
    var buttonImage = config.buttonImage || config.logoUrl || 'https://chat.chateam.ws/logo.png';

    // Tamaños
    var sizes = {
      small: { button: 50, windowWidth: 320, windowHeight: 450 },
      medium: { button: 60, windowWidth: 370, windowHeight: 550 },
      large: { button: 70, windowWidth: 420, windowHeight: 620 }
    };
    var sizeConfig = sizes[size] || sizes.medium;

    var positionBottom = position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;';
    var positionRight = position.includes('right') ? 'right: 20px;' : 'left: 20px;';

    var styles = document.createElement('style');
    styles.id = 'jrchat-styles';
    styles.textContent = '#jrchat-widget {' +
      'position: fixed;' +
      positionBottom +
      positionRight +
      'z-index: 999999;' +
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;' +
    '}' +
    '#jrchat-button {' +
      'width: ' + sizeConfig.button + 'px;' +
      'height: ' + sizeConfig.button + 'px;' +
      'border-radius: 50%;' +
      (buttonImage
        ? 'background: transparent url(' + buttonImage + ') center / contain no-repeat;' +
          'filter: drop-shadow(0 3px 6px rgba(0,0,0,0.30));'
        : 'background: ' + primaryColor + ';' +
          'box-shadow: 0 4px 12px rgba(0,0,0,0.25);') +
      'color: white;' +
      'border: none;' +
      'cursor: pointer;' +
      'font-size: ' + (sizeConfig.button * 0.45) + 'px;' +
      'display: flex;' +
      'align-items: center;' +
      'justify-content: center;' +
      'transition: transform 0.2s;' +
    '}' +
    '#jrchat-button:hover {' +
      'transform: scale(1.08);' +
    '}' +
    '#jrchat-button svg {' +
      (buttonImage
        ? 'display: none;'
        : 'width: ' + (sizeConfig.button * 0.5) + 'px;' +
          'height: ' + (sizeConfig.button * 0.5) + 'px;' +
          'fill: currentColor;') +
    '}' +
    '#jrchat-window {' +
      'display: none;' +
      'width: ' + sizeConfig.windowWidth + 'px;' +
      'height: ' + sizeConfig.windowHeight + 'px;' +
      'max-height: calc(100vh - 100px);' +
      'background: white;' +
      'border-radius: ' + borderRadius + 'px;' +
      'box-shadow: 0 8px 32px rgba(0,0,0,0.2);' +
      'flex-direction: column;' +
      'overflow: hidden;' +
      'margin-bottom: 12px;' +
    '}' +
    '#jrchat-window.open {' +
      'display: flex;' +
      'animation: jrchat-slideUp 0.3s ease;' +
    '}' +
    '@keyframes jrchat-slideUp {' +
      'from { opacity: 0; transform: translateY(20px); }' +
      'to { opacity: 1; transform: translateY(0); }' +
    '}' +
    '#jrchat-header {' +
      'background: ' + primaryColor + ';' +
      'color: white;' +
      'padding: 18px 20px;' +
      'display: flex;' +
      'justify-content: space-between;' +
      'align-items: center;' +
      'flex-shrink: 0;' +
    '}' +
    '#jrchat-header h3 {' +
      'margin: 0;' +
      'font-size: 16px;' +
      'font-weight: 600;' +
    '}' +
    '#jrchat-close {' +
      'background: rgba(255,255,255,0.2);' +
      'border: none;' +
      'color: white;' +
      'width: 28px;' +
      'height: 28px;' +
      'border-radius: 50%;' +
      'cursor: pointer;' +
      'font-size: 18px;' +
      'display: flex;' +
      'align-items: center;' +
      'justify-content: center;' +
      'transition: background 0.2s;' +
    '}' +
    '#jrchat-close:hover {' +
      'background: rgba(255,255,255,0.3);' +
    '}' +
    '#jrchat-messages {' +
      'flex: 1;' +
      'overflow-y: auto;' +
      'padding: 20px;' +
      'background: #f8f9fa;' +
    '}' +
    '.jrchat-msg {' +
      'margin-bottom: 14px;' +
      'display: flex;' +
      'flex-direction: column;' +
    '}' +
    '.jrchat-msg.user {' +
      'align-items: flex-end;' +
    '}' +
    '.jrchat-msg.agent {' +
      'align-items: flex-start;' +
    '}' +
    '.jrchat-msg-bubble {' +
      'max-width: 80%;' +
      'padding: 12px 16px;' +
      'border-radius: 18px;' +
      'font-size: 14px;' +
      'line-height: 1.45;' +
      'word-wrap: break-word;' +
    '}' +
    '.jrchat-msg.user .jrchat-msg-bubble {' +
      'background: ' + primaryColor + ';' +
      'color: white;' +
      'border-bottom-right-radius: 4px;' +
    '}' +
    '.jrchat-msg.agent .jrchat-msg-bubble {' +
      'background: white;' +
      'color: #333;' +
      'border-bottom-left-radius: 4px;' +
      'box-shadow: 0 1px 2px rgba(0,0,0,0.08);' +
    '}' +
    '.jrchat-msg-time {' +
      'font-size: 11px;' +
      'color: #999;' +
      'margin-top: 4px;' +
      'padding: 0 8px;' +
    '}' +
    '.jrchat-welcome {' +
      'text-align: center;' +
      'color: #666;' +
      'padding: 30px 20px;' +
      'font-size: 14px;' +
      'line-height: 1.5;' +
    '}' +
    '#jrchat-input-area {' +
      'padding: 16px;' +
      'background: white;' +
      'border-top: 1px solid #eee;' +
      'display: flex;' +
      'gap: 10px;' +
      'flex-shrink: 0;' +
    '}' +
    '#jrchat-input {' +
      'flex: 1;' +
      'border: 1px solid #e0e0e0;' +
      'border-radius: 24px;' +
      'padding: 12px 18px;' +
      'font-size: 14px;' +
      'outline: none;' +
      'font-family: inherit;' +
      'transition: border-color 0.2s;' +
    '}' +
    '#jrchat-input:focus {' +
      'border-color: ' + primaryColor + ';' +
    '}' +
    '#jrchat-send {' +
      'width: 44px;' +
      'height: 44px;' +
      'border-radius: 50%;' +
      'background: ' + primaryColor + ';' +
      'color: white;' +
      'border: none;' +
      'cursor: pointer;' +
      'font-size: 18px;' +
      'display: flex;' +
      'align-items: center;' +
      'justify-content: center;' +
      'flex-shrink: 0;' +
      'transition: opacity 0.2s;' +
    '}' +
    '#jrchat-send:hover {' +
      'opacity: 0.9;' +
    '}' +
    '#jrchat-send:disabled {' +
      'opacity: 0.5;' +
      'cursor: not-allowed;' +
    '}' +
    '@media (max-width: 480px) {' +
      '#jrchat-window {' +
        'width: calc(100vw - 24px);' +
        'height: calc(100vh - 100px);' +
        'border-radius: 12px;' +
      '}' +
    '}';

    // Aplicar CSS personalizado del widget (definido por-widget en el panel)
    if (config.customCSS && typeof config.customCSS === 'string' && config.customCSS.trim()) {
      styles.textContent += '\n/* --- customCSS --- */\n' + config.customCSS;
    }

    document.head.appendChild(styles);
  }

  // Crear elementos del widget
  function createWidget() {
    var container = document.createElement('div');
    container.id = 'jrchat-widget';

	    var welcomeMsg = escapeHtml(config.welcomeMessage || '¡Hola! ¿En qué podemos ayudarte?');
	    var placeholderText = escapeHtml(config.placeholderText || 'Escribe tu mensaje...');

    container.innerHTML = '<div id="jrchat-window">' +
      '<div id="jrchat-header">' +
        '<h3>Chat de Soporte</h3>' +
        '<button id="jrchat-close">&times;</button>' +
      '</div>' +
      '<div id="jrchat-messages">' +
        '<div class="jrchat-welcome">' + welcomeMsg + '</div>' +
      '</div>' +
      '<div id="jrchat-input-area">' +
        '<input type="text" id="jrchat-input" placeholder="' + placeholderText + '">' +
        '<button id="jrchat-send">' +
          '<svg viewBox="0 0 24 24" width="20" height="20">' +
            '<path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>' +
          '</svg>' +
        '</button>' +
      '</div>' +
    '</div>' +
    '<button id="jrchat-button">' +
      '<svg viewBox="0 0 24 24">' +
        '<path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>' +
      '</svg>' +
    '</button>';

    document.body.appendChild(container);

    // Event listeners
    document.getElementById('jrchat-button').addEventListener('click', toggleChat);
    document.getElementById('jrchat-close').addEventListener('click', closeChat);
    document.getElementById('jrchat-send').addEventListener('click', sendMessage);
    document.getElementById('jrchat-input').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') sendMessage();
    });
  }

  // Abrir chat
  function openChat() {
    var chatWindow = document.getElementById('jrchat-window');
    if (chatWindow) {
      chatWindow.classList.add('open');
      document.getElementById('jrchat-input').focus();
    }
  }

  // Cerrar chat
  function closeChat() {
    var chatWindow = document.getElementById('jrchat-window');
    if (chatWindow) {
      chatWindow.classList.remove('open');
    }
  }

  // Toggle chat
  function toggleChat() {
    var chatWindow = document.getElementById('jrchat-window');
    if (chatWindow) {
      if (chatWindow.classList.contains('open')) {
        closeChat();
      } else {
        openChat();
      }
    }
  }

  // Enviar mensaje
  function sendMessage() {
    var input = document.getElementById('jrchat-input');
    var message = input.value.trim();

    if (!message) return;

    // Agregar mensaje a la UI
    addMessage(message, 'user');
    input.value = '';

	    fetch(config.backendUrl + '/webchat/public/message', {
	      method: 'POST',
	      headers: {
	        'Content-Type': 'application/json'
	      },
	      body: JSON.stringify({
	        widgetApiKey: config.apiKey,
	        sessionId: sessionId,
	        message: message,
	        pageUrl: window.location.href
	      })
	    })
	    .then(function(response) {
	      if (!response.ok) {
	        return response.json().then(function(error) {
	          console.error('Error enviando mensaje:', error);
	          addMessage('Error al enviar el mensaje. Intenta de nuevo.', 'agent');
	        });
	      }
        return response.json();
	    })
    .then(function(data) {
        if (data && data.messageId) {
          displayedMessageIds[data.messageId] = true;
          lastMessageId = Math.max(lastMessageId, Number(data.messageId) || 0);
        }
        pollMessages();
	    })
	    .catch(function(error) {
	      console.error('Error de conexión:', error);
	      addMessage('Error de conexión. Verifica tu conexión a internet.', 'agent');
	    });
	  }

	  function escapeHtml(value) {
	    return String(value || '')
	      .replace(/&/g, '&amp;')
	      .replace(/</g, '&lt;')
	      .replace(/>/g, '&gt;')
	      .replace(/"/g, '&quot;')
	      .replace(/'/g, '&#039;');
	  }

  function startPolling() {
    pollMessages();
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = setInterval(pollMessages, 4000);
  }

  function pollMessages() {
    if (!config || !config.apiKey || !sessionId) return;

    var url = config.backendUrl + '/webchat/public/messages/' +
      encodeURIComponent(config.apiKey) + '/' +
      encodeURIComponent(sessionId) +
      (lastMessageId ? '?afterId=' + encodeURIComponent(lastMessageId) : '');

    fetch(url)
      .then(function(response) {
        if (!response.ok) return null;
        return response.json();
      })
      .then(function(data) {
        if (!data || !Array.isArray(data.messages)) return;
        data.messages.forEach(function(msg) {
          lastMessageId = Math.max(lastMessageId, Number(msg.id) || 0);
          if (displayedMessageIds[msg.id]) return;
          displayedMessageIds[msg.id] = true;
          addMessage(
            msg.body || msg.content || '',
            msg.direction === 'outbound' ? 'agent' : 'user',
            msg.createdAt || msg.updatedAt
          );
        });
      })
      .catch(function(error) {
        console.warn('WebChat polling error:', error.message);
      });
  }

  // Agregar mensaje a la UI
  function addMessage(text, sender, createdAt) {
    var container = document.getElementById('jrchat-messages');
    if (!container) return;

    // Remover mensaje de bienvenida si existe
    var welcome = container.querySelector('.jrchat-welcome');
    if (welcome) welcome.remove();

    var msgDiv = document.createElement('div');
    msgDiv.className = 'jrchat-msg ' + sender;

    var bubble = document.createElement('div');
    bubble.className = 'jrchat-msg-bubble';
    bubble.textContent = text;

    var time = document.createElement('div');
    time.className = 'jrchat-msg-time';
    time.textContent = new Date(createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    msgDiv.appendChild(bubble);
    msgDiv.appendChild(time);
    container.appendChild(msgDiv);

    container.scrollTop = container.scrollHeight;
  }

  // Inicializar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processQueue);
  } else {
    processQueue();
  }

})(window, document);
