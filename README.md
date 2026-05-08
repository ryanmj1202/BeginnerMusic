# 🎵 BeginnerMusic

> A beginner-friendly web-based Digital Audio Workstation (DAW)

BeginnerMusic is a web-based music composition tool designed to make creating music easier for everyone.

Traditional DAWs can feel overwhelming because of complex interfaces, difficult terminology, and tedious mixing processes. BeginnerMusic solves these problems by simplifying music production and providing intuitive tools.

---

## ✨ Features

### 🎹 Piano Roll Editor
- Grid-based composition interface
- Click to create notes
- Drag to move and resize notes
- Pattern repeat support
- Multi-track editing


### 🇰🇷 Beginner-Friendly UX
- Simplified terminology
- Intuitive controls
- Reduced learning curve for new users

### 💾 File Support
- Save / Load project as JSON
- Import / Export MIDI
- Export MP3

### 🎧 Playback System
- Real-time playback
- Auto-scrolling playhead
- Preview note playback

---


## 🏗️ Project Structure

```text
src/
 ┣ features/
 ┃ ┗ editor/
 ┃   ┣ components/
 ┃   ┣ hooks/
 ┃   ┣ utils/
 ┃   ┗ types/
 ┣ assets/
 ┣ constants/
 ┣ types/
 ┗ utils/
```

The project was refactored from a large monolithic structure into a modular hook-based architecture.

---

## 🚀 Tech Stack

- React
- TypeScript
- Vite
- Tone.js
- Firebase

---

## 📦 Installation

```bash
git clone https://github.com/ryanmj1202/BeginnerMusic.git
cd BeginnerMusic
npm install
npm run dev
```

---

## 🔨 Build

```bash
npm run build
```

---

## 📜 License

MIT License

Copyright (c) 2026 강민재
