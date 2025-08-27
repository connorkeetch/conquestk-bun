const fs = require('fs');
const path = require('path');

// Create a minimal WAV file (silent audio)
// This is a valid WAV file with 1 second of silence
const silentWavBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
const silentWavBuffer = Buffer.from(silentWavBase64, 'base64');

// Define all sound files
const soundFiles = {
  effects: [
    'dice.mp3',
    'victory.mp3', 
    'defeat.mp3',
    'capture.mp3',
    'eliminated.mp3',
    'gamestart.mp3',
    'yourturn.mp3',
    'message.mp3',
    'error.mp3'
  ],
  music: [
    'track1.mp3',
    'track2.mp3',
    'track3.mp3',
    'track4.mp3',
    'track5.mp3'
  ]
};

// Create placeholder files
const soundsDir = path.join(__dirname, '..', 'frontend', 'public', 'sounds');

// Create WAV files (browsers can play WAV even if named .mp3 for placeholders)
Object.entries(soundFiles).forEach(([category, files]) => {
  const categoryDir = path.join(soundsDir, category);
  
  files.forEach(filename => {
    const filepath = path.join(categoryDir, filename);
    
    // Create a slightly different duration for each file to distinguish them
    // For now, just use the same silent WAV for all
    fs.writeFileSync(filepath, silentWavBuffer);
    console.log(`Created placeholder: ${category}/${filename}`);
  });
});

console.log('\nPlaceholder sound files created successfully!');
console.log('Note: These are silent placeholders. Replace with actual sound files later.');