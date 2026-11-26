/**
 * SmartHire AI — Resume ATS Page Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  window.guardAuth();
  window.renderAppNavbar('resume');

  const dropzone = document.getElementById('resume-dropzone');
  const fileInput = document.getElementById('resume-file-input');
  const fileNameDisplay = document.getElementById('selected-file-name');
  const analyzeBtn = document.getElementById('analyze-resume-btn');
  const resultsCard = document.getElementById('analysis-results-card');
  const targetRoleInput = document.getElementById('target-role-input');
  const jobDescInput = document.getElementById('job-description-input');
  const rawTextInput = document.getElementById('resume-raw-text-input');
  const targetedInterviewBtn = document.getElementById('generate-targeted-interview-btn');

  let selectedFile = null;
  let detectedGaps = [];

  document.getElementById('browse-resume-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  dropzone.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length > 0) handleFileSelection(e.dataTransfer.files[0]);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFileSelection(fileInput.files[0]);
  });

  function handleFileSelection(file) {
    if (file.size > 10 * 1024 * 1024) {
      window.showToast('File size exceeds 10 MB limit.', 'error');
      return;
    }
    selectedFile = file;
    fileNameDisplay.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    window.showToast(`Loaded ${file.name}`, 'info');
  }

  function renderAnalysisResult(data) {
    resultsCard.style.display = 'block';
    document.getElementById('ats-result-filename').textContent = data.file_name || 'ATS Alignment Profile';
    document.getElementById('ats-score-display').textContent = `${data.match_score ?? data.ats_score ?? 0}%`;
    document.getElementById('ats-summary-text').textContent = data.summary || data.executive_summary || '';

    const extractedContainer = document.getElementById('extracted-skills-container');
    extractedContainer.innerHTML = '';
    const skillsObj = data.skills || data.skills_extracted || {};
    const allExtracted = Array.isArray(skillsObj)
      ? skillsObj
      : Object.values(skillsObj).flat();

    if (allExtracted.length === 0) {
      extractedContainer.innerHTML = '<span style="font-size:0.82rem; color:var(--text-muted);">No matching technical taxonomy keywords found.</span>';
    } else {
      allExtracted.forEach(skill => {
        const tag = document.createElement('span');
        tag.className = 'skill-tag';
        tag.textContent = skill;
        extractedContainer.appendChild(tag);
      });
    }

    const missingContainer = document.getElementById('missing-skills-container');
    missingContainer.innerHTML = '';
    detectedGaps = data.missing_skills || [];
    if (detectedGaps.length === 0) {
      missingContainer.innerHTML = '<span style="font-size:0.82rem; color:var(--success-mint);">No critical skill gaps detected!</span>';
    } else {
      detectedGaps.forEach(skill => {
        const tag = document.createElement('span');
        tag.className = 'skill-tag missing';
        tag.textContent = `+ ${skill}`;
        missingContainer.appendChild(tag);
      });
    }

    const expList = document.getElementById('extracted-exp-list');
    const expItems = data.experience || [];
    expList.innerHTML = expItems.length
      ? expItems.map(i => `<li>${window.escapeHtml(i.detail || i.role || JSON.stringify(i))}</li>`).join('')
      : '<li style="color:var(--text-muted);">No explicit Experience section lines parsed.</li>';

    const eduList = document.getElementById('extracted-edu-list');
    const eduItems = data.education || [];
    eduList.innerHTML = eduItems.length
      ? eduItems.map(i => `<li>${window.escapeHtml(i.detail || i.degree || JSON.stringify(i))}</li>`).join('')
      : '<li style="color:var(--text-muted);">No explicit Education section lines parsed.</li>';
  }

  async function loadHistory() {
    const container = document.getElementById('resume-history-container');
    try {
      const resumes = await window.API.getResumeHistory();
      if (!resumes || resumes.length === 0) {
        container.innerHTML = '<p style="font-size:0.86rem; color:var(--text-muted);">No resumes uploaded yet.</p>';
        return;
      }
      container.innerHTML = `
        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Target Role</th>
                <th>ATS Score</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${resumes.map(r => `
                <tr>
                  <td><strong>${window.escapeHtml(r.file_name)}</strong></td>
                  <td>${window.escapeHtml(r.target_role)}</td>
                  <td class="mono" style="font-weight:700; color:var(--lavender-700);">${r.ats_score}%</td>
                  <td><span class="sticker-badge" style="font-size:0.65rem;">${window.escapeHtml(r.processing_status)}</span></td>
                  <td class="mono" style="font-size:0.78rem;">${new Date(r.created_at).toLocaleDateString()}</td>
                  <td style="display:flex; gap:0.4rem;">
                    <button type="button" class="btn btn-secondary view-resume-btn" data-id="${r.id}" style="padding:0.25rem 0.65rem; font-size:0.76rem;">View</button>
                    <button type="button" class="btn btn-ghost delete-resume-btn" data-id="${r.id}" style="padding:0.25rem 0.65rem; font-size:0.76rem; color:var(--danger-rose);">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      container.querySelectorAll('.view-resume-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = resumes.find(x => x.id === btn.getAttribute('data-id'));
          if (item) {
            renderAnalysisResult(item);
            resultsCard.scrollIntoView({ behavior: 'smooth' });
          }
        });
      });

      container.querySelectorAll('.delete-resume-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this resume version permanently?')) return;
          try {
            await window.API.deleteResume(btn.getAttribute('data-id'));
            window.showToast('Resume deleted.', 'success');
            loadHistory();
          } catch (err) {
            window.showToast(err.message, 'error');
          }
        });
      });

      // Automatically show latest resume on initial load
      if (resultsCard.style.display === 'none') {
        renderAnalysisResult(resumes[0]);
      }
    } catch (err) {
      container.innerHTML = `<p style="color:var(--danger-rose); font-size:0.86rem;">Failed to load resume history.</p>`;
    }
  }

  analyzeBtn.addEventListener('click', async () => {
    const pastedText = rawTextInput.value.trim();
    if (!selectedFile && !pastedText) {
      window.showToast('Please select a resume file (.pdf, .docx, .txt) or paste resume text.', 'error');
      return;
    }

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Validating & Parsing Resume...';

    const formData = new FormData();
    if (selectedFile) formData.append('resume', selectedFile);
    if (pastedText) formData.append('raw_text', pastedText);
    formData.append('target_role', targetRoleInput.value.trim());
    formData.append('job_description', jobDescInput.value.trim());

    try {
      const res = await window.API.analyzeResume(formData);
      renderAnalysisResult(res.data || res);
      window.showToast('Resume ATS analysis completed!', 'success');
      loadHistory();
      resultsCard.scrollIntoView({ block: 'nearest' });
    } catch (err) {
      window.showToast(err.message || 'Resume parsing failed.', 'error');
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = '🔍 Analyze Resume & Compute ATS Match';
    }
  });

  targetedInterviewBtn.addEventListener('click', () => {
    const skillsParam = encodeURIComponent(detectedGaps.join(', '));
    window.location.href = `interview.html?skills=${skillsParam}`;
  });

  loadHistory();
});
