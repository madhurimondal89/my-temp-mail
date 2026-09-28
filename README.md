# MyTempMails – Modern Temporary Disposable Email Service

A fast, secure, and privacy-first disposable email web application inspired by [MyTempMails](https://mytempmails.com/). Built with pure HTML, modern Vanilla CSS, and clean ES6 JavaScript.

![MyTempMails Preview](favicon.svg)

---

## ✨ Features

- ⚡ **Instant Disposable Address**: Generates an active, working mailbox upon opening the app.
- 🔀 **Multi-Provider Architecture**: Switch between 6 free engines:
  - 🚀 **Mail.tm**: Modern, high-speed REST API with `@uberip.com`.
  - 🛡️ **Guerrilla Mail**: Established since 2006 with `@guerrillamailblock.com`.
  - 🤖 **smails.dev**: Modern agent-friendly REST engine with instant tokenized inboxes (`@smails.dev`).
  - 🎓 **temp.tf**: Verified educational & pro disposable inboxes (`@high.edu.pl`).
  - ⚡ **Temp-Mail.io**: Turbo engine with fresh domains (`@yzcalo.com`, `@olipii.com`).
  - 📨 **Inboxes (GetNada)**: 18+ fast disposable domains.
  - 🧪 **Offline / Interactive Demo**: Instant local testing anytime.
- 🛡️ **Auto-Failover**: Automatically tries the next working provider if one is temporarily busy.
- 📬 **Live Real-Time Inbox**: Auto-syncs and checks for incoming emails with visual radar and Web Audio chime notifications.
- ⏱️ **Countdown Timer**: 10-minute lifespan indicator with progress bar and **+10 Min** extension button.
- 📱 **Mobile QR Code**: Generates a dynamic QR code to easily transfer or open the inbox on mobile devices.
- ✏️ **Custom Handle**: Choose your own custom address prefix.
- 🛡️ **Safe HTML Reader**: Sandboxed email viewer for reading verification emails, OTP codes, and newsletters safely.
- 🧪 **Built-in Demo Email Simulator**: Click "Send Test Email" to immediately test incoming email notifications, audio bells, and HTML rendering.
- 🎨 **State-of-the-Art Design**: Glassmorphism aesthetic, ambient glow backgrounds, dark & light mode toggles, and responsive split-pane inbox layout.
- 🗃️ **Session Inboxes**: History drawer to switch between previously created addresses in the current session.

---

## 🚀 Quick Start

### Option 1: Start with Node.js
```bash
npm start
```
Then visit: `http://localhost:3000`

### Option 2: Direct Browser Open
You can also open `index.html` directly in any modern web browser (Chrome, Edge, Firefox, Brave, Safari).

---

## 📂 Project Structure

```
my temp mails/
├── index.html        # Main semantic application layout & SEO metadata
├── styles.css        # Luxury dark/light CSS design system & animations
├── app.js            # Mail.tm client, polling, timer, audio, and UI controller
├── server.js         # Lightweight local static HTTP server
├── favicon.svg       # Glowing SVG icon
├── package.json      # NPM scripts
└── README.md         # Documentation
```
