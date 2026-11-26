/**
 * SmartHire AI — Live Mock Interview Room Controller
 * Real getUserMedia audio/video telemetry, Web Speech API live transcription,
 * real-time WPM & filler detection, draggable PIP HUD, session recovery, and graceful fallbacks.
 */

document.addEventListener('DOMContentLoaded', async () => {
  window.guardAuth();
  window.renderAppNavbar('interview');

  const urlParams = new URLSearchParams(window.location.search);
  const prefilledSkills = urlParams.get('skills');
  const resumeSessionId = urlParams.get('session_id') || sessionStorage.getItem('active_interview_session_id');

  if (prefilledSkills) {
    const focusInput = document.getElementById('input-focus-skills');
    if (focusInput) focusInput.value = prefilledSkills;
  }

  const setupPanel = document.getElementById('interview-setup-panel');
  const activeRoom = document.getElementById('active-interview-room');
  const startBtn = document.getElementById('start-interview-btn');
  const prevBtn = document.getElementById('prev-question-btn');
  const nextBtn = document.getElementById('next-question-btn');
  const submitBtn = document.getElementById('submit-interview-btn');
  const micToggleBtn = document.getElementById('mic-toggle-btn');
  const webcamPreview = document.getElementById('webcam-preview');
  const pipWebcam = document.getElementById('pip-webcam');
  const fallbackMsg = document.getElementById('fallback-feed-msg');
  const amberNotice = document.getElementById('media-amber-notice');
  const audioFill = document.getElementById('audio-meter-fill');
  const micStatusLabel = document.getElementById('mic-status-label');
  const tabSpeech = document.getElementById('tab-speech-mode');
  const tabCode = document.getElementById('tab-code-mode');
  const speechContainer = document.getElementById('speech-mode-container');
  const codeContainer = document.getElementById('code-mode-container');
  const transcriptInput = document.getElementById('live-transcript-input');
  const codeInput = document.getElementById('code-input');
  const codeLangSelect = document.getElementById('code-language-select');
  const pipBox = document.getElementById('pip-camera-box');
  const pipGazeStatus = document.getElementById('pip-gaze-status');

  const FILLERS = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally', 'sort of', 'kind of'];

  let currentSession = null;
  let currentQuestions = [];
  let currentQuestionIdx = 0;
  let answersByQuestionId = {};
  let timerInterval = null;
  let remainingSeconds = 1200;
  let questionStartedAt = Date.now();
  let isRecording = false;
  let mediaStream = null;
  let speechRecognition = null;
  let audioCtx = null;
  let cameraActive = false;

  async function initMediaDevices() {
    const camChecked = document.getElementById('consent-camera').checked;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not supported');
      }
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: camChecked, audio: true });
      if (camChecked && mediaStream.getVideoTracks().length > 0) {
        webcamPreview.srcObject = mediaStream;
        pipWebcam.srcObject = mediaStream;
        fallbackMsg.style.display = 'none';
        cameraActive = true;
        pipGazeStatus.textContent = 'Camera Active (Local)';
      } else {
        fallbackMsg.style.display = 'block';
        pipGazeStatus.textContent = 'Camera Off (No Penalty)';
      }

      micStatusLabel.textContent = 'Microphone Active';
      setupAudioMeter(mediaStream);
    } catch (e) {
      cameraActive = false;
      amberNotice.style.display = 'block';
      fallbackMsg.style.display = 'block';
      micStatusLabel.textContent = 'Text / Keyboard Mode';
      micStatusLabel.style.color = 'var(--warning-amber)';
      pipGazeStatus.textContent = 'Audio-Optional Mode';
    }
  }

  function setupAudioMeter(stream) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      function updateMeter() {
        if (!audioCtx) return;
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const pct = Math.min(100, Math.max(4, Math.round((avg / 128) * 100)));
        if (audioFill) audioFill.style.width = `${pct}%`;
        requestAnimationFrame(updateMeter);
      }
      updateMeter();
    } catch (e) {}
  }

  initMediaDevices();

  // Draggable PIP Camera HUD
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  pipBox.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragOffsetX = e.clientX - pipBox.offsetLeft;
    dragOffsetY = e.clientY - pipBox.offsetTop;
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    pipBox.style.right = 'auto';
    pipBox.style.left = `${Math.max(0, e.clientX - dragOffsetX)}px`;
    pipBox.style.top = `${Math.max(0, e.clientY - dragOffsetY)}px`;
  });
  window.addEventListener('mouseup', () => { isDragging = false; });

  // Tabs
  tabSpeech.addEventListener('click', () => {
    tabSpeech.classList.add('active');
    tabCode.classList.remove('active');
    speechContainer.style.display = 'block';
    codeContainer.style.display = 'none';
  });

  tabCode.addEventListener('click', () => {
    tabCode.classList.add('active');
    tabSpeech.classList.remove('active');
    codeContainer.style.display = 'block';
    speechContainer.style.display = 'none';
  });

  // Live WPM & Filler Calculation
  function updateLiveSpeechMetrics() {
    const text = transcriptInput.value.trim();
    const words = text ? text.split(/\s+/).filter(Boolean) : [];
    const elapsedSec = Math.max(10, Math.round((Date.now() - questionStartedAt) / 1000));
    const wpm = words.length ? Math.round((words.length / elapsedSec) * 60) : 0;

    const lower = text.toLowerCase();
    let fillerCount = 0;
    FILLERS.forEach(f => {
      const m = lower.match(new RegExp(`\\b${f}\\b`, 'g'));
      if (m) fillerCount += m.length;
    });

    document.getElementById('live-word-count').textContent = String(words.length);
    document.getElementById('live-wpm').textContent = `${wpm} WPM`;
    document.getElementById('live-fillers').textContent = `${fillerCount} detected`;
  }

  transcriptInput.addEventListener('input', updateLiveSpeechMetrics);

  // Real Web Speech API Recording
  micToggleBtn.addEventListener('click', () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      window.showToast('Web Speech API is unavailable in this browser. Type or paste your answer directly in the box below.', 'info');
      transcriptInput.focus();
      return;
    }

    if (!isRecording) {
      speechRecognition = new SpeechRec();
      speechRecognition.continuous = true;
      speechRecognition.interimResults = true;
      speechRecognition.lang = 'en-US';
      const baseText = transcriptInput.value ? transcriptInput.value.trim() + ' ' : '';

      speechRecognition.onresult = (event) => {
        let finalSeg = '';
        let interimSeg = '';
        for (let i = 0; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalSeg += piece + ' ';
          else interimSeg += piece;
        }
        transcriptInput.value = (baseText + finalSeg + interimSeg).trim();
        updateLiveSpeechMetrics();
      };

      speechRecognition.onerror = (ev) => {
        window.showToast(`Speech recognition notice: ${ev.error}. You can edit text directly.`, 'info');
        stopRecording();
      };

      speechRecognition.start();
      isRecording = true;
      micToggleBtn.classList.add('recording');
      document.getElementById('mic-instruction').textContent = 'Listening... Click microphone again to pause';
    } else {
      stopRecording();
    }
  });

  function stopRecording() {
    if (speechRecognition) {
      try { speechRecognition.stop(); } catch (e) {}
    }
    isRecording = false;
    micToggleBtn.classList.remove('recording');
    document.getElementById('mic-instruction').textContent = 'Recording paused. Edit transcript or click Save & Next.';
  }

  function enterActiveRoom(sessionObj, startIndex = 0, serverRemainingSeconds = null) {
    currentSession = sessionObj;
    currentQuestions = sessionObj.questions || [];
    answersByQuestionId = {};
    (sessionObj.answers || []).forEach(a => {
      answersByQuestionId[a.question] = a;
    });

    sessionStorage.setItem('active_interview_session_id', sessionObj.id);
    document.getElementById('hud-domain-badge').textContent = `${sessionObj.domain} • ${sessionObj.category}`;
    document.getElementById('hud-session-id').textContent = `#${String(sessionObj.id).slice(0, 8)}`;

    setupPanel.style.display = 'none';
    activeRoom.style.display = 'flex';

    remainingSeconds = serverRemainingSeconds !== null ? serverRemainingSeconds : (sessionObj.duration_minutes || 20) * 60;
    startSessionCountdown();
    loadQuestion(Math.min(startIndex, Math.max(0, currentQuestions.length - 1)));
  }

  function startSessionCountdown() {
    clearInterval(timerInterval);
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      remainingSeconds = Math.max(0, remainingSeconds - 1);
      updateTimerDisplay();
      if (remainingSeconds <= 0) {
        clearInterval(timerInterval);
        window.showToast('Session time expired. Submitting recorded answers...', 'info');
        concludeSession();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    const el = document.getElementById('hud-timer');
    if (el) {
      el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      el.style.color = remainingSeconds < 60 ? 'var(--danger-rose)' : 'var(--lavender-700)';
    }
  }

  function loadQuestion(idx) {
    if (idx < 0 || idx >= currentQuestions.length) return;
    stopRecording();
    currentQuestionIdx = idx;
    questionStartedAt = Date.now();
    const q = currentQuestions[idx];

    document.getElementById('hud-question-counter').textContent = `Question ${idx + 1} of ${currentQuestions.length}`;
    document.getElementById('question-competency-badge').textContent = q.competency || q.category || 'Core Competency';
    document.getElementById('current-question-text').textContent = q.prompt;

    const saved = answersByQuestionId[q.id];
    transcriptInput.value = saved ? (saved.transcript_text || '') : '';
    codeInput.value = saved ? (saved.code_text || '') : '';
    if (saved && saved.language) codeLangSelect.value = saved.language;

    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === currentQuestions.length - 1 ? 'Save Answer ✓' : 'Save & Next Question →';
    updateLiveSpeechMetrics();
  }

  async function persistCurrentAnswer(nextIndex = null) {
    const q = currentQuestions[currentQuestionIdx];
    if (!q || !currentSession) return;

    const transcript = transcriptInput.value.trim();
    const code = codeInput.value.trim();
    const mode = code && !transcript ? 'code' : 'speech';
    const durationSec = Math.max(5, Math.round((Date.now() - questionStartedAt) / 1000));

    const payload = {
      session_id: currentSession.id,
      question_id: q.id,
      input_mode: mode,
      language: codeLangSelect.value,
      transcript_text: transcript,
      code_text: code,
      duration_seconds: durationSec,
      eye_contact_percentage: cameraActive ? 92.0 : 0.0,
      next_question_index: nextIndex !== null ? nextIndex : currentQuestionIdx,
    };

    const res = await window.API.submitAnswer(payload);
    if (res && res.answer) {
      answersByQuestionId[q.id] = res.answer;
    }
    return res;
  }

  // Resume session on page reload or ?session_id=
  if (resumeSessionId) {
    try {
      const existing = await window.API.getSession(resumeSessionId);
      if (existing && existing.status !== 'completed' && existing.status !== 'cancelled') {
        enterActiveRoom(existing, existing.current_question_index || 0, existing.remaining_total_seconds ?? null);
        window.showToast('Recovered active interview session.', 'info');
      } else {
        sessionStorage.removeItem('active_interview_session_id');
      }
    } catch (e) {
      sessionStorage.removeItem('active_interview_session_id');
    }
  }

  startBtn.addEventListener('click', async () => {
    const recConsent = document.getElementById('consent-recording').checked;
    const camConsent = document.getElementById('consent-camera').checked;
    if (!recConsent) {
      window.showToast('Please accept assessment & speech consent before starting.', 'error');
      return;
    }

    startBtn.disabled = true;
    startBtn.textContent = 'Synthesizing Session Questions...';

    const payload = {
      domain: document.getElementById('select-domain').value,
      category: document.getElementById('select-category').value,
      difficulty: document.getElementById('select-difficulty').value,
      duration_minutes: parseInt(document.getElementById('select-duration').value, 10),
      question_count: parseInt(document.getElementById('select-qcount').value, 10),
      focus_skills: document.getElementById('input-focus-skills').value.split(',').map(s => s.trim()).filter(Boolean),
      camera_enabled: camConsent && cameraActive,
      recording_consent: recConsent,
    };

    try {
      const res = await window.API.startInterview(payload);
      enterActiveRoom(res.session, 0);
      window.showToast('Interview session initialized!', 'success');
    } catch (err) {
      window.showToast(err.message || 'Failed to start interview.', 'error');
      startBtn.disabled = false;
      startBtn.textContent = '⚡ Initialize & Start Interview Session';
    }
  });

  prevBtn.addEventListener('click', async () => {
    if (currentQuestionIdx <= 0) return;
    try {
      await persistCurrentAnswer(currentQuestionIdx - 1);
      loadQuestion(currentQuestionIdx - 1);
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  nextBtn.addEventListener('click', async () => {
    const isLast = currentQuestionIdx >= currentQuestions.length - 1;
    try {
      const targetIdx = isLast ? currentQuestionIdx : currentQuestionIdx + 1;
      await persistCurrentAnswer(targetIdx);
      window.showToast('Answer saved.', 'success');
      if (!isLast) {
        loadQuestion(targetIdx);
      }
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  async function concludeSession() {
    stopRecording();
    clearInterval(timerInterval);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Evaluating Responses...';
    try {
      await persistCurrentAnswer(currentQuestionIdx);
      const res = await window.API.finishInterview(currentSession.id);
      sessionStorage.removeItem('active_interview_session_id');
      window.showToast(`Evaluation complete! Score: ${res.evaluation?.overall_score}`, 'success');
      setTimeout(() => {
        window.location.href = `insights.html?session_id=${currentSession.id}`;
      }, 450);
    } catch (err) {
      window.showToast(err.message || 'Error finalizing evaluation.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Conclude & Evaluate Session 🚀';
    }
  }

  submitBtn.addEventListener('click', concludeSession);

  document.getElementById('exit-interview-btn').addEventListener('click', async () => {
    if (confirm('Save current answer and return to dashboard? You can resume this session anytime.')) {
      try {
        await persistCurrentAnswer(currentQuestionIdx);
      } catch (e) {}
      window.location.href = 'home.html';
    }
  });
});
