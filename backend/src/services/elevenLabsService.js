const axios = require("axios");

const API_KEY  = process.env.ELEVENLABS_API_KEY;

const VOICES = {
  default: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
  coach: process.env.ELEVENLABS_COACH_VOICE_ID || process.env.ELEVENLABS_VOICE_ID_2 || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
};

function resolveVoiceId(voicePreset) {
  return VOICES[voicePreset] || VOICES.default;
}

/**
 * Convert text to speech using ElevenLabs.
 * Returns a Buffer containing the MP3 audio.
 */
const textToSpeech = async (text, voicePreset = "default") => {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${resolveVoiceId(voicePreset)}`;

  const response = await axios.post(
    url,
    {
      text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    },
    {
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      responseType: "arraybuffer",
    }
  );

  return Buffer.from(response.data);
};

module.exports = { textToSpeech };
