/**
 * MyTempMails - Disposable Temporary Email Web Application
 * Multi-Provider Architecture supporting:
 * 1. Mail.tm (Pro Cloud)
 * 2. Guerrilla Mail (Classic Engine)
 * 3. Temp-Mail.io (Turbo Engine)
 * 4. Interactive Simulation (Offline / Demo)
 * With CORS proxy support, active inbox persistence across page refresh,
 * Web Audio notification chime, and dynamic QR generation.
 */

(() => {
  'use strict';

  // --- Configuration ---
  const DEFAULT_LIFETIME_SEC = 600; // 10 minutes
  const POLL_INTERVAL_MS = 5000;    // 5 seconds

  // Helper to route through built-in server proxy when running on HTTP/HTTPS
  function apiUrl(rawUrl) {
    if (window.location.protocol.startsWith('http')) {
      return `/proxy?url=${encodeURIComponent(rawUrl)}`;
    }
    return rawUrl;
  }

  // --- State Variables ---
  const state = {
    provider: 'mailtm', // 'mailtm' | 'guerrilla' | 'tempmailio' | 'simulation'
    email: '',
    domain: '',
    messages: [],
    selectedMessage: null,
    remainingSeconds: DEFAULT_LIFETIME_SEC,
    timerInterval: null,
    pollInterval: null,
    soundEnabled: true,
    theme: 'dark',
    history: [],
    viewFormat: 'html',

    // Provider Credentials
    mailtm: { token: '', accountId: '', password: '', domain: '' },
    guerrilla: { sid_token: '', email_addr: '' },
    smails: { token: '', address: '' },
    temptf: { email: '' },
    tempmailio: { email: '', token: '' },
    inboxes: { email: '', domain: '' }
  };

  // --- DOM Elements ---
  const elements = {
    // Header
    providerSelect: document.getElementById('provider-select'),
    heroProviderBadge: document.getElementById('hero-provider-badge'),
    networkStatusText: document.getElementById('network-status-text'),
    networkStatusIndicator: document.getElementById('network-status-indicator'),
    btnToggleSound: document.getElementById('btn-toggle-sound'),
    soundIcon: document.getElementById('sound-icon'),
    btnOpenHistory: document.getElementById('btn-open-history'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),

    // Hero / Generator Card
    emailAddressText: document.getElementById('email-address-text'),
    btnCopyEmail: document.getElementById('btn-copy-email'),
    copyBtnText: document.getElementById('copy-btn-text'),
    timerBadge: document.getElementById('timer-badge'),
    timerCountdown: document.getElementById('timer-countdown'),
    timerProgressFill: document.getElementById('timer-progress-fill'),
    btnExtendTimer: document.getElementById('btn-extend-timer'),
    btnRefreshMail: document.getElementById('btn-refresh-mail'),
    btnNewEmail: document.getElementById('btn-new-email'),
    btnCustomEmail: document.getElementById('btn-custom-email'),
    btnShowQr: document.getElementById('btn-show-qr'),
    btnDeleteEmail: document.getElementById('btn-delete-email'),

    // Inbox
    inboxSplitView: document.getElementById('inbox-split-view'),
    inboxCounter: document.getElementById('inbox-counter'),
    btnSendTestEmail: document.getElementById('btn-send-test-email'),
    btnEmptySendTest: document.getElementById('btn-empty-send-test'),
    inboxEmptyState: document.getElementById('inbox-empty-state'),
    messagesListWrapper: document.getElementById('messages-list-wrapper'),

    // Detail Reader
    detailPlaceholder: document.getElementById('detail-placeholder'),
    detailViewContainer: document.getElementById('detail-view-container'),
    btnBackToList: document.getElementById('btn-back-to-list'),
    detailSubject: document.getElementById('detail-subject'),
    detailAvatar: document.getElementById('detail-avatar'),
    detailSenderName: document.getElementById('detail-sender-name'),
    detailSenderAddress: document.getElementById('detail-sender-address'),
    detailDate: document.getElementById('detail-date'),
    btnPrintEmail: document.getElementById('btn-print-email'),
    btnCopyBody: document.getElementById('btn-copy-body'),
    btnDeleteMessage: document.getElementById('btn-delete-message'),
    btnFormatHtml: document.getElementById('btn-format-html'),
    btnFormatText: document.getElementById('btn-format-text'),
    emailIframeViewer: document.getElementById('email-iframe-viewer'),
    emailPlainViewer: document.getElementById('email-plain-viewer'),
    detailAttachmentsWrapper: document.getElementById('detail-attachments-wrapper'),
    detailAttachmentsList: document.getElementById('detail-attachments-list'),

    // Modals
    modalQr: document.getElementById('modal-qr'),
    btnCloseQr: document.getElementById('btn-close-qr'),
    qrCodeCanvasContainer: document.getElementById('qr-code-canvas-container'),
    qrEmailLabel: document.getElementById('qr-email-label'),
    btnCopyFromQr: document.getElementById('btn-copy-from-qr'),

    modalCustom: document.getElementById('modal-custom'),
    btnCloseCustom: document.getElementById('btn-close-custom'),
    formCustomEmail: document.getElementById('form-custom-email'),
    customUsernameInput: document.getElementById('custom-username-input'),
    customDomainAddon: document.getElementById('custom-domain-addon'),

    modalHistory: document.getElementById('modal-history'),
    btnCloseHistory: document.getElementById('btn-close-history'),
    inboxHistoryList: document.getElementById('inbox-history-list'),
    btnClearHistory: document.getElementById('btn-clear-history'),

    // Toast
    toastContainer: document.getElementById('toast-container')
  };

  function randomString(length = 8) {
    return Math.random().toString(36).substring(2, 2 + length);
  }

  function decodeHtmlEntities(str) {
    if (!str) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    let res = txt.value;
    if (res.includes('&lt;') && res.includes('&gt;')) {
      txt.innerHTML = res;
      res = txt.value;
    }
    return res;
  }

  function htmlToPlainText(html) {
    if (!html) return '';
    const decoded = decodeHtmlEntities(html);
    const temp = document.createElement('div');
    temp.innerHTML = decoded;
    return (temp.textContent || temp.innerText || '').trim();
  }

  // ==========================================================================
  // Provider Implementations
  // ==========================================================================
  const Providers = {

    // 1. Mail.tm Engine
    mailtm: {
      name: 'Mail.tm',
      async init() {
        if (!state.mailtm.domain) {
          const res = await fetch(apiUrl('https://api.mail.tm/domains'), {
            headers: { 'Accept': 'application/json' }
          });
          const data = await res.json();
          const list = data['hydra:member'] || data;
          state.mailtm.domain = (list.find(d => d.isActive !== false) || list[0]).domain;
        }
        return state.mailtm.domain;
      },
      async createMailbox(customUsername) {
        const domain = await this.init();
        const username = (customUsername || `temp.${randomString(7)}`).toLowerCase();
        const address = `${username}@${domain}`;
        const password = `Pass!${randomString(10)}`;

        // Create Account
        const accRes = await fetch(apiUrl('https://api.mail.tm/accounts'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ address, password })
        });
        if (!accRes.ok && accRes.status !== 422) {
          throw new Error(`Mail.tm account creation failed (${accRes.status})`);
        }

        // Token
        const tokenRes = await fetch(apiUrl('https://api.mail.tm/token'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ address, password })
        });
        if (!tokenRes.ok) throw new Error(`Mail.tm token failed (${tokenRes.status})`);

        const tokenData = await tokenRes.json();
        state.mailtm.token = tokenData.token;
        state.mailtm.accountId = tokenData.id || '';
        state.mailtm.password = password;

        return { email: address, domain };
      },
      async fetchMessages() {
        if (!state.mailtm.token) return [];
        const res = await fetch(apiUrl('https://api.mail.tm/messages?page=1'), {
          headers: {
            'Authorization': `Bearer ${state.mailtm.token}`,
            'Accept': 'application/json'
          }
        });
        if (!res.ok) return [];
        const data = await res.json();
        const rawList = data['hydra:member'] || data || [];

        return rawList.map(m => ({
          id: m.id,
          from: { name: m.from?.name || '', address: m.from?.address || 'Someone' },
          subject: m.subject || '(No Subject)',
          intro: m.intro || '',
          seen: m.seen,
          createdAt: m.createdAt,
          hasAttachments: m.hasAttachments,
          provider: 'mailtm'
        }));
      },
      async fetchMessageDetail(id) {
        const res = await fetch(apiUrl(`https://api.mail.tm/messages/${id}`), {
          headers: {
            'Authorization': `Bearer ${state.mailtm.token}`,
            'Accept': 'application/json'
          }
        });
        if (!res.ok) throw new Error('Failed to fetch message body');
        const detail = await res.json();
        return {
          id: detail.id,
          from: { name: detail.from?.name, address: detail.from?.address },
          subject: detail.subject || '(No Subject)',
          html: Array.isArray(detail.html) ? detail.html.join('') : (detail.html || ''),
          text: detail.text || detail.intro || '',
          createdAt: detail.createdAt,
          attachments: (detail.attachments || []).map(a => ({
            filename: a.filename,
            size: a.size,
            downloadUrl: a.downloadUrl ? (a.downloadUrl.startsWith('http') ? a.downloadUrl : `https://api.mail.tm${a.downloadUrl}`) : '#'
          }))
        };
      },
      async deleteMessage(id) {
        if (!state.mailtm.token) return;
        await fetch(apiUrl(`https://api.mail.tm/messages/${id}`), {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${state.mailtm.token}` }
        });
      }
    },

    // 2. Guerrilla Mail Engine
    guerrilla: {
      name: 'Guerrilla Mail',
      async init() {
        return 'guerrillamailblock.com';
      },
      async createMailbox(customUsername) {
        const res = await fetch(apiUrl('https://api.guerrillamail.com/ajax.php?f=get_email_address'));
        if (!res.ok) throw new Error(`Guerrilla error: ${res.status}`);
        const data = await res.json();
        state.guerrilla.sid_token = data.sid_token;

        let address = data.email_addr;

        if (customUsername) {
          try {
            const setRes = await fetch(apiUrl(`https://api.guerrillamail.com/ajax.php?f=set_email_user&email_user=${encodeURIComponent(customUsername)}&sid_token=${data.sid_token}`));
            if (setRes.ok) {
              const setData = await setRes.json();
              if (setData.email_addr) address = setData.email_addr;
            }
          } catch (e) {}
        }

        state.guerrilla.email_addr = address;
        const domain = address.includes('@') ? address.split('@')[1] : 'guerrillamailblock.com';
        return { email: address, domain };
      },
      async fetchMessages() {
        if (!state.guerrilla.sid_token) return [];
        const res = await fetch(apiUrl(`https://api.guerrillamail.com/ajax.php?f=get_email_list&offset=0&sid_token=${state.guerrilla.sid_token}`));
        if (!res.ok) return [];
        const data = await res.json();
        const list = data.list || [];

        return list.map(m => {
          const rawSubj = (m.mail_subject || '').trim();
          const cleanIntro = htmlToPlainText(m.mail_excerpt || '');
          return {
            id: String(m.mail_id),
            from: { name: (m.mail_from || '').split('@')[0], address: m.mail_from || 'Someone' },
            subject: rawSubj || '(No Subject)',
            intro: cleanIntro,
            seen: m.mail_read === 1,
            createdAt: m.mail_timestamp ? new Date(parseInt(m.mail_timestamp) * 1000).toISOString() : new Date().toISOString(),
            provider: 'guerrilla'
          };
        });
      },
      async fetchMessageDetail(id) {
        const res = await fetch(apiUrl(`https://api.guerrillamail.com/ajax.php?f=fetch_email&email_id=${id}&sid_token=${state.guerrilla.sid_token}`));
        if (!res.ok) throw new Error('Failed to fetch Guerrilla email');
        const detail = await res.json();
        const rawBody = detail.mail_body || '';
        const decodedHtml = decodeHtmlEntities(rawBody);
        const plainText = htmlToPlainText(rawBody);

        return {
          id: String(detail.mail_id),
          from: { name: (detail.mail_from || '').split('@')[0], address: detail.mail_from || 'Someone' },
          subject: (detail.mail_subject || '').trim() || '(No Subject)',
          html: decodedHtml,
          text: plainText,
          createdAt: detail.mail_timestamp ? new Date(parseInt(detail.mail_timestamp) * 1000).toISOString() : new Date().toISOString(),
          attachments: []
        };
      },
      async deleteMessage(id) {
        if (!state.guerrilla.sid_token) return;
        await fetch(apiUrl(`https://api.guerrillamail.com/ajax.php?f=del_email&email_ids[]=${id}&sid_token=${state.guerrilla.sid_token}`));
      }
    },

    // 3. smails.dev Engine (Modern REST & Agent-Native)
    smails: {
      name: 'smails.dev',
      async init() {
        return 'smails.dev';
      },
      async createMailbox(customUsername) {
        const payload = customUsername ? { username: customUsername } : {};
        const res = await fetch(apiUrl('https://smails.dev/api/mailbox'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`smails.dev error ${res.status}`);
        const data = await res.json();
        state.smails.token = data.token;
        state.smails.address = data.address;
        const domain = data.address.split('@')[1] || 'smails.dev';
        return { email: data.address, domain };
      },
      async fetchMessages() {
        if (!state.smails.token) return [];
        const res = await fetch(apiUrl('https://smails.dev/api/mailbox/messages'), {
          headers: {
            'Authorization': `Bearer ${state.smails.token}`,
            'Accept': 'application/json'
          }
        });
        if (!res.ok) return [];
        const list = await res.json();
        if (!Array.isArray(list)) return [];

        return list.map(m => {
          const sender = m.from?.address || m.from || 'Someone';
          const senderName = m.from?.name || (typeof sender === 'string' ? sender.split('@')[0] : 'Sender');
          return {
            id: String(m.id),
            from: { name: senderName, address: typeof sender === 'string' ? sender : (sender.address || 'Sender') },
            subject: m.subject || '(No Subject)',
            intro: m.snippet || m.text || m.subject || '',
            seen: true,
            createdAt: m.createdAt || m.date || new Date().toISOString(),
            provider: 'smails'
          };
        });
      },
      async fetchMessageDetail(id) {
        const res = await fetch(apiUrl(`https://smails.dev/api/mailbox/messages/${id}`), {
          headers: {
            'Authorization': `Bearer ${state.smails.token}`,
            'Accept': 'application/json'
          }
        });
        if (!res.ok) throw new Error('Failed to fetch smails message body');
        const detail = await res.json();
        const rawHtml = detail.html || '';
        const rawText = detail.text || '';
        const sender = detail.from?.address || detail.from || 'Someone';
        const senderName = detail.from?.name || (typeof sender === 'string' ? sender.split('@')[0] : 'Sender');

        return {
          id: String(detail.id || id),
          from: { name: senderName, address: typeof sender === 'string' ? sender : (detail.from?.address || 'Someone') },
          subject: detail.subject || '(No Subject)',
          html: decodeHtmlEntities(rawHtml),
          text: htmlToPlainText(rawText || rawHtml),
          createdAt: detail.createdAt || detail.date || new Date().toISOString(),
          attachments: (detail.attachments || []).map(a => ({
            filename: a.filename || a.name || 'attachment',
            size: a.size || 0,
            downloadUrl: a.url || a.downloadUrl || '#'
          }))
        };
      },
      async deleteMessage(id) {
        if (!state.smails.token) return;
        try {
          await fetch(apiUrl(`https://smails.dev/api/mailbox/messages/${id}`), {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.smails.token}` }
          });
        } catch (e) {}
      }
    },

    // 4. temp.tf Engine (.edu.pl Educational & Pro Domains)
    temptf: {
      name: 'temp.tf (.edu)',
      async init() {
        return 'high.edu.pl';
      },
      async createMailbox() {
        const res = await fetch(apiUrl('https://temp.tf/api/account'));
        if (!res.ok) throw new Error(`temp.tf error: ${res.status}`);
        const data = await res.json();
        const email = data.email || data.address;
        state.temptf.email = email;
        const domain = email.includes('@') ? email.split('@')[1] : 'high.edu.pl';
        return { email, domain };
      },
      async fetchMessages() {
        if (!state.temptf.email) return [];
        try {
          const res = await fetch(apiUrl('https://temp.tf/api/check'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: state.temptf.email, wait: false })
          });
          if (!res.ok) return [];
          const data = await res.json();
          const rawList = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);

          return rawList.map(m => {
            const sender = m.from || 'Someone';
            const isHtml = m.bodyContentType === 'html';
            const introText = isHtml ? htmlToPlainText(m.body || '') : (m.body || '');
            return {
              id: String(m.id || m._id || Math.random()),
              from: { name: sender.split('@')[0], address: sender },
              subject: m.subject || '(No Subject)',
              intro: introText.substring(0, 100),
              seen: true,
              createdAt: m.date || new Date().toISOString(),
              hasAttachments: !!(m.attachments && m.attachments.length > 0),
              provider: 'temptf',
              rawMessage: m
            };
          });
        } catch (e) {
          return [];
        }
      },
      async fetchMessageDetail(id) {
        const found = state.messages.find(m => String(m.id) === String(id));
        if (found && found.rawMessage) {
          const m = found.rawMessage;
          const isHtml = m.bodyContentType === 'html';
          return {
            id: String(m.id || id),
            from: { name: (m.from || 'Someone').split('@')[0], address: m.from || 'Someone' },
            subject: m.subject || '(No Subject)',
            html: isHtml ? decodeHtmlEntities(m.body || '') : '',
            text: !isHtml ? (m.body || '') : htmlToPlainText(m.body || ''),
            createdAt: m.date || new Date().toISOString(),
            attachments: (m.attachments || []).map(a => ({
              filename: a.filename || a.name || 'attachment',
              size: a.size || 0,
              downloadUrl: a.downloadUrl || a.url || (a.id ? `https://temp.tf/api/attachment?id=${a.id}` : '#')
            }))
          };
        }
        if (found) return found;
        throw new Error('Message not found');
      },
      async deleteMessage(id) {
        state.messages = state.messages.filter(m => String(m.id) !== String(id));
      }
    },

    // 3. Temp-Mail.io Engine
    tempmailio: {
      name: 'Temp-Mail.io',
      async init() {
        return 'temp-mail.io';
      },
      async createMailbox(customUsername) {
        const bodyPayload = customUsername
          ? { name: customUsername }
          : { min_name_length: 6, max_name_length: 9 };

        const res = await fetch(apiUrl('https://api.internal.temp-mail.io/api/v3/email/new'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });
        if (!res.ok) throw new Error(`Temp-Mail.io error ${res.status}`);
        const data = await res.json();
        state.tempmailio.email = data.email;
        state.tempmailio.token = data.token || '';

        const domain = data.email.split('@')[1] || 'temp-mail.io';
        return { email: data.email, domain };
      },
      async fetchMessages() {
        if (!state.tempmailio.email) return [];
        const res = await fetch(apiUrl(`https://api.internal.temp-mail.io/api/v3/email/${state.tempmailio.email}/messages`));
        if (!res.ok) return [];
        const rawList = await res.json();
        if (!Array.isArray(rawList)) return [];

        return rawList.map(m => ({
          id: m.id,
          from: { name: (m.from || '').split('@')[0], address: m.from || 'Someone' },
          subject: m.subject || '(No Subject)',
          intro: m.body_text ? m.body_text.substring(0, 100) : '',
          html: m.body_html || '',
          text: m.body_text || '',
          seen: true,
          createdAt: m.created_at || new Date().toISOString(),
          attachments: (m.attachments || []).map(a => ({
            filename: a.name || 'attachment',
            size: a.size || 0,
            downloadUrl: a.download_url || '#'
          })),
          provider: 'tempmailio'
        }));
      },
      async fetchMessageDetail(id) {
        const found = state.messages.find(m => m.id === id);
        if (found) return found;
        throw new Error('Message not found');
      },
      async deleteMessage() {
        // No delete on temp-mail.io
      }
    },

    // 4. Inboxes.com (GetNada) Engine
    inboxes: {
      name: 'Inboxes (GetNada)',
      async init() {
        if (!state.inboxes?.domain) {
          try {
            const res = await fetch(apiUrl('https://inboxes.com/api/v2/domain'));
            if (res.ok) {
              const data = await res.json();
              const list = data.domains || [];
              if (list.length > 0) {
                state.inboxes.domain = list[Math.floor(Math.random() * list.length)].qdn || 'getnada.com';
              }
            }
          } catch (e) {}
        }
        return state.inboxes.domain || 'getnada.com';
      },
      async createMailbox(customUsername) {
        const domain = await this.init();
        const username = (customUsername || `temp.${randomString(7)}`).toLowerCase();
        const address = `${username}@${domain}`;
        state.inboxes.email = address;
        return { email: address, domain };
      },
      async fetchMessages() {
        if (!state.inboxes?.email) return [];
        try {
          const res = await fetch(apiUrl(`https://inboxes.com/api/v2/inbox/${state.inboxes.email}`));
          if (!res.ok) return [];
          const data = await res.json();
          const rawList = data.msgs || [];

          return rawList.map(m => {
            const sender = m.f || m.fe || 'Someone';
            return {
              id: m.uid,
              from: { name: sender.split('@')[0], address: m.fe || sender },
              subject: m.s || '(No Subject)',
              intro: m.s || '',
              seen: true,
              createdAt: m.dt || new Date().toISOString(),
              provider: 'inboxes'
            };
          });
        } catch (e) {
          return [];
        }
      },
      async fetchMessageDetail(id) {
        const res = await fetch(apiUrl(`https://inboxes.com/api/v2/message/${id}`));
        if (!res.ok) throw new Error('Failed to fetch Inboxes message');
        const data = await res.json();
        const msg = data.msg;
        if (!msg) throw new Error('Message not found');

        const rawHtml = msg.html || '';
        const rawText = msg.text || msg.b || '';

        return {
          id: msg.uid || id,
          from: { name: (msg.f || msg.fe || 'Someone').split('@')[0], address: msg.fe || msg.f },
          subject: msg.s || '(No Subject)',
          html: decodeHtmlEntities(rawHtml),
          text: htmlToPlainText(rawText || rawHtml),
          createdAt: msg.dt || new Date().toISOString(),
          attachments: (msg.files || []).map(f => ({
            filename: f.name || 'attachment',
            size: f.size || 0,
            downloadUrl: f.url || '#'
          }))
        };
      },
      async deleteMessage(id) {
        try {
          await fetch(apiUrl(`https://inboxes.com/api/v2/message/${id}`), { method: 'DELETE' });
        } catch (e) {}
      }
    },

    // 5. Interactive Simulation (Offline / Fallback)
    simulation: {
      name: 'Interactive Demo',
      async init() {
        return 'tempmail.live';
      },
      async createMailbox(customUsername) {
        const username = (customUsername || `demo.${randomString(6)}`).toLowerCase();
        return { email: `${username}@tempmail.live`, domain: 'tempmail.live' };
      },
      async fetchMessages() {
        return state.messages.filter(m => m.provider === 'simulation');
      },
      async fetchMessageDetail(id) {
        const found = state.messages.find(m => m.id === id);
        if (found) return found;
        throw new Error('Demo message not found');
      },
      async deleteMessage(id) {
        state.messages = state.messages.filter(m => m.id !== id);
      }
    }
  };

  // ==========================================================================
  // Web Audio Notification Chime (Zero External Files)
  // ==========================================================================
  function playNotificationChime() {
    if (!state.soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 arpeggio

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.4);
      });
    } catch (e) {
      console.warn('Audio chime issue:', e);
    }
  }

  // ==========================================================================
  // Toast Notification System
  // ==========================================================================
  function showToast(message, type = 'info', duration = 3500) {
    if (!elements.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconClass = 'ri-information-line';
    if (type === 'success') iconClass = 'ri-checkbox-circle-line';
    if (type === 'warning') iconClass = 'ri-alert-line';
    if (type === 'danger') iconClass = 'ri-error-warning-line';

    toast.innerHTML = `
      <i class="${iconClass}" style="font-size: 1.2rem;"></i>
      <span>${escapeHtml(message)}</span>
    `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideToastOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
      setTimeout(() => toast.remove(), 320);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ==========================================================================
  // Mailbox Controller (Multi-Provider with Auto-Failover & Session Persistence)
  // ==========================================================================
  async function createMailbox(customUsername = null, targetProvider = state.provider) {
    elements.emailAddressText.innerHTML = `
      <span class="email-loading-state">
        <i class="ri-loader-4-line ri-spin"></i> Provisioning via ${Providers[targetProvider].name}...
      </span>
    `;

    const providerList = [targetProvider, 'mailtm', 'guerrilla', 'smails', 'temptf', 'tempmailio', 'inboxes', 'simulation'];
    const uniqueProviders = [...new Set(providerList)];

    let success = false;

    for (const provKey of uniqueProviders) {
      try {
        state.provider = provKey;
        if (elements.providerSelect) elements.providerSelect.value = provKey;
        updateProviderBadge(provKey);

        const currentProvider = Providers[provKey];
        const res = await currentProvider.createMailbox(customUsername);

        state.email = res.email;
        state.domain = res.domain;
        elements.customDomainAddon.textContent = `@${res.domain}`;

        onMailboxReady();
        showToast(`Inbox ready via ${currentProvider.name}: ${state.email}`, 'success');
        saveActiveSession();
        saveInboxToHistory(state.email, currentProvider.name);
        success = true;
        break;
      } catch (err) {
        console.warn(`Provider ${provKey} failed:`, err.message);
      }
    }

    if (!success) {
      state.provider = 'simulation';
      if (elements.providerSelect) elements.providerSelect.value = 'simulation';
      updateProviderBadge('simulation');
      const sim = await Providers.simulation.createMailbox(customUsername);
      state.email = sim.email;
      state.domain = sim.domain;
      onMailboxReady();
      showToast(`Ready in interactive simulation mode: ${state.email}`, 'info');
      saveActiveSession();
    }
  }

  function saveActiveSession() {
    try {
      const sessionData = {
        provider: state.provider,
        email: state.email,
        domain: state.domain,
        mailtm: state.mailtm,
        guerrilla: state.guerrilla,
        smails: state.smails,
        temptf: state.temptf,
        tempmailio: state.tempmailio,
        expiresAt: Date.now() + (state.remainingSeconds * 1000)
      };
      localStorage.setItem('mytempmails_active_session', JSON.stringify(sessionData));
    } catch (e) {}
  }

  function restoreActiveSession() {
    try {
      const stored = localStorage.getItem('mytempmails_active_session');
      if (!stored) return false;
      const data = JSON.parse(stored);
      const timeLeft = Math.floor((data.expiresAt - Date.now()) / 1000);

      if (timeLeft <= 10) {
        // Expired
        localStorage.removeItem('mytempmails_active_session');
        return false;
      }

      state.provider = data.provider || 'mailtm';
      state.email = data.email;
      state.domain = data.domain;
      state.remainingSeconds = timeLeft;
      if (data.mailtm) state.mailtm = data.mailtm;
      if (data.guerrilla) state.guerrilla = data.guerrilla;
      if (data.smails) state.smails = data.smails;
      if (data.temptf) state.temptf = data.temptf;
      if (data.tempmailio) state.tempmailio = data.tempmailio;

      if (elements.providerSelect) elements.providerSelect.value = state.provider;
      updateProviderBadge(state.provider);
      onMailboxReady(true);
      showToast(`Restored active session: ${state.email}`, 'info');
      return true;
    } catch (e) {
      return false;
    }
  }

  function updateProviderBadge(provKey) {
    const p = Providers[provKey] || Providers.mailtm;
    if (elements.heroProviderBadge) {
      elements.heroProviderBadge.innerHTML = `<i class="ri-server-fill"></i> Engine: ${p.name}`;
    }
    if (elements.networkStatusText) {
      elements.networkStatusText.textContent = `${p.name} Active`;
    }
  }

  function onMailboxReady(isRestored = false) {
    elements.emailAddressText.textContent = state.email;
    elements.qrEmailLabel.textContent = state.email;
    if (!isRestored) resetCountdown();
    else startCountdownTimer();

    state.messages = [];
    state.selectedMessage = null;
    renderMessagesList();
    renderDetailPlaceholder();
    startPolling();
  }

  // ==========================================================================
  // Countdown Timer System
  // ==========================================================================
  function resetCountdown() {
    clearInterval(state.timerInterval);
    state.remainingSeconds = DEFAULT_LIFETIME_SEC;
    startCountdownTimer();
  }

  function startCountdownTimer() {
    clearInterval(state.timerInterval);
    updateTimerUI();

    state.timerInterval = setInterval(() => {
      state.remainingSeconds--;
      updateTimerUI();

      if (state.remainingSeconds <= 0) {
        clearInterval(state.timerInterval);
        localStorage.removeItem('mytempmails_active_session');
        showToast('Mailbox time expired. Auto-generating fresh address...', 'warning');
        createMailbox();
      }
    }, 1000);
  }

  function updateTimerUI() {
    const mins = Math.max(0, Math.floor(state.remainingSeconds / 60));
    const secs = Math.max(0, state.remainingSeconds % 60);
    const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    elements.timerCountdown.textContent = timeFormatted;

    const percentage = Math.max(0, Math.min(100, (state.remainingSeconds / DEFAULT_LIFETIME_SEC) * 100));
    elements.timerProgressFill.style.width = `${percentage}%`;

    elements.timerBadge.classList.remove('warning', 'danger');
    if (state.remainingSeconds <= 60) {
      elements.timerBadge.classList.add('danger');
      elements.timerProgressFill.style.background = 'linear-gradient(135deg, #ef4444, #b91c1c)';
    } else if (state.remainingSeconds <= 180) {
      elements.timerBadge.classList.add('warning');
      elements.timerProgressFill.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
    } else {
      elements.timerProgressFill.style.background = 'var(--gradient-brand)';
    }
  }

  function extendTimer(seconds = 600) {
    state.remainingSeconds += seconds;
    saveActiveSession();
    updateTimerUI();
    showToast(`Added +${Math.round(seconds / 60)} minutes to mailbox lifetime!`, 'success');
  }

  // ==========================================================================
  // Real-Time Polling & Message Retrieval
  // ==========================================================================
  function startPolling() {
    clearInterval(state.pollInterval);
    checkNewMessages();
    state.pollInterval = setInterval(() => {
      checkNewMessages();
    }, POLL_INTERVAL_MS);
  }

  async function checkNewMessages(isManual = false) {
    if (isManual) {
      elements.btnRefreshMail.classList.add('spinning');
    }

    try {
      const activeProvider = Providers[state.provider] || Providers.mailtm;
      const list = await activeProvider.fetchMessages();

      // Merge with existing messages so emails NEVER vanish on empty polling ticks!
      const existingMap = new Map();
      state.messages.forEach(m => existingMap.set(m.id, m));

      const newItems = [];
      list.forEach(m => {
        if (!existingMap.has(m.id)) {
          newItems.push(m);
        }
        existingMap.set(m.id, { ...(existingMap.get(m.id) || {}), ...m });
      });

      if (newItems.length > 0) {
        playNotificationChime();
        const latest = newItems[0];
        const sender = latest.from?.name || latest.from?.address || 'Someone';
        showToast(`New email from ${sender}: "${latest.subject}"`, 'success');
      }

      state.messages = Array.from(existingMap.values()).sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      renderMessagesList();

      if (isManual) {
        showToast(`Inbox refreshed via ${activeProvider.name}. (${list.length} messages)`, 'info');
      }
    } catch (err) {
      console.warn('Check messages error:', err);
    } finally {
      if (isManual) {
        setTimeout(() => elements.btnRefreshMail.classList.remove('spinning'), 600);
      }
    }
  }

  // ==========================================================================
  // Render Messages List
  // ==========================================================================
  function renderMessagesList() {
    const count = state.messages.length;
    elements.inboxCounter.textContent = `${count} ${count === 1 ? 'message' : 'messages'}`;

    if (count === 0) {
      elements.inboxEmptyState.style.display = 'flex';
      elements.messagesListWrapper.innerHTML = '';
      return;
    }

    elements.inboxEmptyState.style.display = 'none';

    let html = '';
    state.messages.forEach(msg => {
      const isSelected = state.selectedMessage && state.selectedMessage.id === msg.id;
      const isUnread = !msg.seen;
      const senderName = msg.from?.name || (msg.from?.address ? msg.from.address.split('@')[0] : 'Sender');
      const senderInitial = senderName.charAt(0).toUpperCase() || 'M';
      const subject = msg.subject || '(No Subject)';
      const intro = msg.intro || '';
      const dateFormatted = formatRelativeTime(msg.createdAt);

      html += `
        <div class="email-row-item ${isSelected ? 'active' : ''} ${isUnread ? 'unread' : ''}" data-msg-id="${msg.id}">
          <div class="email-row-header">
            <div class="row-sender-wrapper">
              <div class="row-avatar">${senderInitial}</div>
              <span class="row-sender-name">${escapeHtml(senderName)}</span>
            </div>
            <span class="row-time">${dateFormatted}</span>
          </div>
          <div class="row-subject">${escapeHtml(subject)}</div>
          <div class="row-snippet">${escapeHtml(intro)}</div>
        </div>
      `;
    });

    elements.messagesListWrapper.innerHTML = html;

    const rows = elements.messagesListWrapper.querySelectorAll('.email-row-item');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-msg-id');
        openEmail(id);
      });
    });
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // ==========================================================================
  // Open & Render Single Email Detail
  // ==========================================================================
  async function openEmail(messageId) {
    let fullMsg = state.messages.find(m => m.id === messageId);
    if (!fullMsg) return;

    if (!fullMsg.html && !fullMsg.text) {
      try {
        const activeProvider = Providers[state.provider] || Providers.mailtm;
        const detail = await activeProvider.fetchMessageDetail(messageId);
        fullMsg = { ...fullMsg, ...detail };
        const idx = state.messages.findIndex(m => m.id === messageId);
        if (idx !== -1) state.messages[idx] = fullMsg;
      } catch (e) {
        console.warn('Fetch detail error:', e);
      }
    }

    fullMsg.seen = true;
    state.selectedMessage = fullMsg;
    renderMessagesList();

    elements.detailPlaceholder.style.display = 'none';
    elements.detailViewContainer.style.display = 'flex';
    elements.inboxSplitView.classList.add('show-detail');

    const senderName = fullMsg.from?.name || (fullMsg.from?.address ? fullMsg.from.address.split('@')[0] : 'Sender');
    const senderAddr = fullMsg.from?.address || 'unknown@domain.com';
    const subject = fullMsg.subject || '(No Subject)';
    const date = fullMsg.createdAt ? new Date(fullMsg.createdAt).toLocaleString() : new Date().toLocaleString();

    elements.detailSubject.textContent = subject;
    elements.detailAvatar.textContent = (senderName.charAt(0) || 'M').toUpperCase();
    elements.detailSenderName.textContent = senderName;
    elements.detailSenderAddress.textContent = senderAddr;
    elements.detailDate.textContent = date;

    const rawHtml = fullMsg.html || '';
    const decodedHtml = decodeHtmlEntities(rawHtml);
    const textBody = htmlToPlainText(fullMsg.text || fullMsg.intro || decodedHtml);

    elements.emailPlainViewer.textContent = textBody;
    renderIframeContent(decodedHtml || `<p style="font-family:sans-serif;padding:20px;color:#333;">${escapeHtml(textBody)}</p>`);

    const attachments = fullMsg.attachments || [];
    if (attachments.length > 0) {
      elements.detailAttachmentsWrapper.style.display = 'block';
      let attHtml = '';
      attachments.forEach(att => {
        attHtml += `
          <a href="${att.downloadUrl || '#'}" target="_blank" download="${escapeHtml(att.filename)}" class="attachment-badge-chip">
            <i class="ri-file-download-line" style="color: var(--primary);"></i>
            <span>${escapeHtml(att.filename)}</span>
          </a>
        `;
      });
      elements.detailAttachmentsList.innerHTML = attHtml;
    } else {
      elements.detailAttachmentsWrapper.style.display = 'none';
      elements.detailAttachmentsList.innerHTML = '';
    }

    setFormatView(state.viewFormat);
  }

  function renderIframeContent(rawHtml) {
    const iframe = elements.emailIframeViewer;
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    const styledHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <base target="_blank">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            background: #ffffff;
            margin: 0;
            padding: 20px;
            line-height: 1.6;
            word-wrap: break-word;
          }
          img { max-width: 100%; height: auto; }
          a { color: #7c3aed; }
        </style>
      </head>
      <body>
        ${rawHtml}
      </body>
      </html>
    `;
    doc.write(styledHtml);
    doc.close();

    setTimeout(() => {
      try {
        const h = doc.body.scrollHeight;
        if (h && h > 200) {
          iframe.style.height = `${Math.min(h + 40, 800)}px`;
        }
      } catch (e) {}
    }, 150);
  }

  function setFormatView(format) {
    state.viewFormat = format;
    if (format === 'html') {
      elements.btnFormatHtml.classList.add('active');
      elements.btnFormatText.classList.remove('active');
      elements.emailIframeViewer.style.display = 'block';
      elements.emailPlainViewer.style.display = 'none';
    } else {
      elements.btnFormatHtml.classList.remove('active');
      elements.btnFormatText.classList.add('active');
      elements.emailIframeViewer.style.display = 'none';
      elements.emailPlainViewer.style.display = 'block';
    }
  }

  function renderDetailPlaceholder() {
    elements.detailPlaceholder.style.display = 'flex';
    elements.detailViewContainer.style.display = 'none';
    elements.inboxSplitView.classList.remove('show-detail');
  }

  async function deleteCurrentMessage() {
    if (!state.selectedMessage) return;
    const msgId = state.selectedMessage.id;

    try {
      const activeProvider = Providers[state.provider] || Providers.mailtm;
      await activeProvider.deleteMessage(msgId);
    } catch (e) {
      console.warn('Delete error:', e);
    }

    state.messages = state.messages.filter(m => m.id !== msgId);
    state.selectedMessage = null;
    renderMessagesList();
    renderDetailPlaceholder();
    showToast('Message deleted successfully', 'info');
  }

  // ==========================================================================
  // Send Demo / Simulated Verification Email
  // ==========================================================================
  function injectDemoEmail() {
    const verificationCode = Math.floor(100000 + Math.random() * 900000);
    const demoId = `demo_${Date.now()}_${randomString(4)}`;

    const demoMessage = {
      id: demoId,
      from: {
        name: 'GitHub Security',
        address: 'no-reply@github.com'
      },
      to: [{ address: state.email, name: 'Dev User' }],
      subject: `[GitHub] Verify device for your account – Code: ${verificationCode}`,
      intro: `Verification code: ${verificationCode}. Enter this code to verify your temporary mailbox session.`,
      seen: false,
      createdAt: new Date().toISOString(),
      provider: state.provider,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; width: 48px; height: 48px; background: #0f172a; border-radius: 50%; color: #ffffff; font-size: 26px; line-height: 48px; font-weight: bold;">⚡</div>
            <h2 style="color: #0f172a; margin-top: 12px; margin-bottom: 6px; font-size: 22px;">Device Verification Code</h2>
            <p style="color: #64748b; font-size: 14px; margin: 0;">We noticed a sign-in attempt to your account.</p>
          </div>

          <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #7c3aed;">${verificationCode}</span>
            <p style="color: #64748b; font-size: 13px; margin-top: 8px; margin-bottom: 0;">This code will expire in 10 minutes.</p>
          </div>

          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            If you did not initiate this request, you can safely ignore this message. Your temporary disposable address <strong>${escapeHtml(state.email)}</strong> is fully protected.
          </p>

          <div style="margin-top: 30px; padding-top: 18px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;">
            Engine: ${escapeHtml(Providers[state.provider]?.name || 'MyTempMails')} &bull; Zero logs stored &bull; Encrypted disposable mailbox
          </div>
        </div>
      `,
      text: `Your GitHub verification code is: ${verificationCode}\n\nEnter this code into the prompt to continue.\nThis code expires in 10 minutes.\n\nSent to: ${state.email}`
    };

    state.messages.unshift(demoMessage);
    playNotificationChime();
    renderMessagesList();
    showToast(`Test verification email received from GitHub!`, 'success');
  }

  // ==========================================================================
  // Dynamic QR Code Generator
  // ==========================================================================
  function generateQRCode(text) {
    const encoded = encodeURIComponent(text);
    const img = document.createElement('img');
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&bgcolor=ffffff&color=0f172a&margin=1`;
    img.alt = `QR Code for ${text}`;
    img.style.width = '180px';
    img.style.height = '180px';
    img.style.borderRadius = '8px';

    elements.qrCodeCanvasContainer.innerHTML = '';
    elements.qrCodeCanvasContainer.appendChild(img);
  }

  // ==========================================================================
  // Session History Management
  // ==========================================================================
  function loadHistory() {
    try {
      const stored = localStorage.getItem('mytempmails_history');
      if (stored) state.history = JSON.parse(stored);
    } catch (e) {}
  }

  function saveInboxToHistory(address, providerName) {
    if (!address) return;
    const exists = state.history.some(h => h.address === address);
    if (!exists) {
      state.history.unshift({
        address,
        provider: providerName,
        created: new Date().toISOString()
      });
      if (state.history.length > 10) state.history.pop();
      try {
        localStorage.setItem('mytempmails_history', JSON.stringify(state.history));
      } catch (e) {}
    }
  }

  function renderHistoryModal() {
    if (!elements.inboxHistoryList) return;
    if (state.history.length === 0) {
      elements.inboxHistoryList.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.9rem;">
          No previous inboxes in this session.
        </div>
      `;
      return;
    }

    let html = '';
    state.history.forEach((item, idx) => {
      const isCurrent = item.address === state.email;
      html += `
        <div class="history-item" data-history-idx="${idx}">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <i class="ri-mail-line" style="color: ${isCurrent ? 'var(--primary)' : 'var(--text-subtle)'};"></i>
            <div>
              <div class="history-email-text">${escapeHtml(item.address)}</div>
              <div style="font-size: 0.72rem; color: var(--text-subtle);">${formatRelativeTime(item.created)} &bull; ${item.provider || 'Mail.tm'} ${isCurrent ? ' &bull; Active' : ''}</div>
            </div>
          </div>
          ${isCurrent ? '<span style="font-size: 0.75rem; color: var(--primary); font-weight: 700;">Current</span>' : '<button class="detail-action-btn" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;">Switch</button>'}
        </div>
      `;
    });

    elements.inboxHistoryList.innerHTML = html;

    elements.inboxHistoryList.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = el.getAttribute('data-history-idx');
        const item = state.history[idx];
        if (item && item.address !== state.email) {
          state.email = item.address;
          closeModal(elements.modalHistory);
          onMailboxReady();
          showToast(`Switched to inbox: ${item.address}`, 'success');
        }
      });
    });
  }

  // ==========================================================================
  // Clipboard Copy Helper (Task 12: Robust navigator.clipboard + execCommand fallback)
  // ==========================================================================
  async function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
    if (!text) return false;
    let copied = false;

    // Strategy 1: Asynchronous Clipboard API
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (err) {
        // Fallback to strategy 2 below
      }
    }

    // Strategy 2: Offscreen textarea + document.execCommand fallback
    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.left = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, 99999);
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (err) {
        copied = false;
      }
    }

    if (copied) {
      showToast(successMsg, 'success');
      return true;
    } else {
      showToast('Could not copy automatically. Please copy manually.', 'warning');
      return false;
    }
  }

  function triggerSparkleBurst(btnElement) {
    if (!btnElement) return;
    const rect = btnElement.getBoundingClientRect();
    const count = 28;
    const colors = ['#00f2fe', '#00d2ff', '#0066ff', '#38bdf8', '#10B981', '#FFFFFF'];

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = Math.floor(Math.random() * 6) + 4;
      
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const velocity = Math.random() * 80 + 40;
      const destX = Math.cos(angle) * velocity;
      const destY = Math.sin(angle) * velocity;

      p.style.cssText = `
        position: fixed;
        left: ${startX}px;
        top: ${startY}px;
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${color};
        box-shadow: 0 0 10px ${color};
        pointer-events: none;
        z-index: 10000;
        transition: transform 0.65s cubic-bezier(0.1, 0.8, 0.3, 1), opacity 0.65s ease;
      `;

      document.body.appendChild(p);

      requestAnimationFrame(() => {
        p.style.transform = `translate(${destX}px, ${destY}px) scale(0)`;
        p.style.opacity = '0';
      });

      setTimeout(() => p.remove(), 700);
    }
  }

  // ==========================================================================
  // Modal Helpers
  // ==========================================================================
  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('open');
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('open');
  }

  // ==========================================================================
  // Theme & Audio Controls
  // ==========================================================================
  function initTheme() {
    const saved = localStorage.getItem('mytempmails_theme') || 'dark';
    setTheme(saved);
  }

  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('mytempmails_theme', theme);
    } catch (e) {}

    if (elements.themeIcon) {
      elements.themeIcon.className = theme === 'dark' ? 'ri-moon-clear-line' : 'ri-sun-line';
    }
  }

  function toggleTheme() {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    elements.soundIcon.className = state.soundEnabled ? 'ri-volume-up-line' : 'ri-volume-mute-line';
    showToast(state.soundEnabled ? 'Notification sound enabled' : 'Notification sound muted', 'info');
  }

  // ==========================================================================
  // Event Bindings
  // ==========================================================================
  function setupEvents() {
    // Provider Switcher Dropdown
    if (elements.providerSelect) {
      elements.providerSelect.addEventListener('change', (e) => {
        const selected = e.target.value;
        if (selected !== state.provider) {
          localStorage.removeItem('mytempmails_active_session');
          showToast(`Switching engine to ${Providers[selected].name}...`, 'info');
          createMailbox(null, selected);
        }
      });
    }

    // Copy address button with sparkle burst
    elements.btnCopyEmail.addEventListener('click', () => {
      if (state.email) {
        copyToClipboard(state.email, 'Temporary email address copied!');
        triggerSparkleBurst(elements.btnCopyEmail);
        elements.copyBtnText.textContent = 'Copied!';
        setTimeout(() => elements.copyBtnText.textContent = 'Copy Address', 2000);
      }
    });

    // Extend Timer
    elements.btnExtendTimer.addEventListener('click', () => {
      extendTimer(600);
    });

    // Refresh Mail
    elements.btnRefreshMail.addEventListener('click', () => {
      checkNewMessages(true);
    });

    // New Email / Change Address
    elements.btnNewEmail.addEventListener('click', () => {
      localStorage.removeItem('mytempmails_active_session');
      createMailbox();
    });

    // Delete Email
    elements.btnDeleteEmail.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete this temporary inbox and all messages?')) {
        localStorage.removeItem('mytempmails_active_session');
        createMailbox();
        showToast('Mailbox destroyed and replaced with a fresh address', 'info');
      }
    });

    // Custom Handle Modal Trigger
    elements.btnCustomEmail.addEventListener('click', () => {
      elements.customDomainAddon.textContent = `@${state.domain || 'domain.com'}`;
      elements.customUsernameInput.value = '';
      openModal(elements.modalCustom);
      setTimeout(() => elements.customUsernameInput.focus(), 100);
    });

    elements.btnCloseCustom.addEventListener('click', () => closeModal(elements.modalCustom));
    elements.formCustomEmail.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = elements.customUsernameInput.value.trim().toLowerCase();
      if (!val) return;
      localStorage.removeItem('mytempmails_active_session');
      closeModal(elements.modalCustom);
      createMailbox(val);
    });

    // QR Code Modal Trigger
    elements.btnShowQr.addEventListener('click', () => {
      if (!state.email) return;
      generateQRCode(state.email);
      elements.qrEmailLabel.textContent = state.email;
      openModal(elements.modalQr);
    });

    elements.btnCloseQr.addEventListener('click', () => closeModal(elements.modalQr));
    elements.btnCopyFromQr.addEventListener('click', () => {
      copyToClipboard(state.email, 'Address copied!');
      closeModal(elements.modalQr);
    });

    // Session History Modal Trigger
    elements.btnOpenHistory.addEventListener('click', () => {
      renderHistoryModal();
      openModal(elements.modalHistory);
    });

    elements.btnCloseHistory.addEventListener('click', () => closeModal(elements.modalHistory));
    elements.btnClearHistory.addEventListener('click', () => {
      state.history = [];
      try { localStorage.removeItem('mytempmails_history'); } catch (e) {}
      renderHistoryModal();
      showToast('History cleared', 'info');
    });

    // Send Test Email Buttons
    elements.btnSendTestEmail.addEventListener('click', () => injectDemoEmail());
    elements.btnEmptySendTest.addEventListener('click', () => injectDemoEmail());

    // Email Detail Controls
    elements.btnBackToList.addEventListener('click', () => {
      elements.inboxSplitView.classList.remove('show-detail');
    });

    elements.btnPrintEmail.addEventListener('click', () => {
      window.print();
    });

    elements.btnCopyBody.addEventListener('click', () => {
      if (state.selectedMessage) {
        const text = state.selectedMessage.text || state.selectedMessage.intro || '';
        copyToClipboard(text, 'Email body copied to clipboard!');
      }
    });

    elements.btnDeleteMessage.addEventListener('click', () => {
      deleteCurrentMessage();
    });

    elements.btnFormatHtml.addEventListener('click', () => setFormatView('html'));
    elements.btnFormatText.addEventListener('click', () => setFormatView('text'));

    // Theme & Sound
    elements.btnThemeToggle.addEventListener('click', toggleTheme);
    elements.btnToggleSound.addEventListener('click', toggleSound);

    // FAQ Accordion
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
      const q = item.querySelector('.faq-question');
      q.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        faqItems.forEach(i => i.classList.remove('active'));
        if (!isActive) item.classList.add('active');
      });
    });

    // Close modals on overlay backdrop click
    [elements.modalQr, elements.modalCustom, elements.modalHistory].forEach(modal => {
      if (!modal) return;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
      });
    });

    // Keyboard ESC to close modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal(elements.modalQr);
        closeModal(elements.modalCustom);
        closeModal(elements.modalHistory);
      }
    });

    // Header navigation dropdown click toggle
    const btnHomeDropdown = document.getElementById('btn-home-dropdown');
    const navHomeDropdown = document.getElementById('nav-home-dropdown');
    if (btnHomeDropdown && navHomeDropdown) {
      btnHomeDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        navHomeDropdown.classList.toggle('open');
      });
      document.addEventListener('click', (e) => {
        if (!navHomeDropdown.contains(e.target)) {
          navHomeDropdown.classList.remove('open');
        }
      });
    }
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  function init() {
    initTheme();
    loadHistory();
    setupEvents();

    // Try restoring existing active session so page refresh doesn't wipe active inbox
    const restored = restoreActiveSession();
    if (!restored) {
      createMailbox();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
