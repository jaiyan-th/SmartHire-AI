"""
SmartHire AI — Real Headless Chrome End-to-End Browser Verification (React SPA + Django API)
Tests Landing, Candidate, Recruiter, and Admin workflows, zero JS console errors,
camera/mic denied graceful fallback, RBAC UI gating, and responsive viewports.
"""
import time
import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

FRONTEND_URL = "http://127.0.0.1:8000"


def build_driver():
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1440,900")
    opts.add_experimental_option("prefs", {
        "profile.default_content_setting_values.media_stream_mic": 2,
        "profile.default_content_setting_values.media_stream_camera": 2,
    })
    opts.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    return webdriver.Chrome(options=opts)


def assert_no_console_errors(driver, context_name):
    logs = driver.get_log("browser")
    severe = [l for l in logs if l["level"] == "SEVERE" and "favicon.ico" not in l["message"]]
    if severe:
        raise AssertionError(f"Browser console errors on {context_name}: {severe}")


def scroll_click(driver, elem):
    driver.execute_script("arguments[0].scrollIntoView({block: 'center', inline: 'nearest'});", elem)
    time.sleep(0.25)
    driver.execute_script("arguments[0].click();", elem)


def type_text(driver, elem, text):
    driver.execute_script("arguments[0].scrollIntoView({block: 'center', inline: 'nearest'});", elem)
    time.sleep(0.2)
    driver.execute_script("arguments[0].focus();", elem)
    elem.send_keys(text)
    if text[:8] not in (elem.get_attribute("value") or ""):
        driver.execute_script(
            """
            const el = arguments[0];
            const val = arguments[1];
            const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            """,
            elem,
            text,
        )


def cleanup_e2e_users(prefix="e2e_"):
    """Remove temporary E2E accounts so the local database stays clean of test data."""
    import os
    from pathlib import Path
    repo_root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(repo_root / "backend"))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django
    django.setup()
    from django.contrib.auth import get_user_model
    from apps.core.models import AuditLog
    User = get_user_model()
    qs = User.objects.filter(email__startswith=prefix, email__endswith="@test.local")
    count = qs.count()
    qs.delete()
    AuditLog.objects.filter(message__icontains="@test.local").delete()
    if count:
        print(f"Cleaned up {count} temporary E2E account(s) from database.")


def run_e2e():
    ts = int(time.time())
    cand_email = f"e2e_cand_{ts}@test.local"
    admin_email = f"e2e_admin_{ts}@test.local"
    rec_email = f"e2e_rec_{ts}@test.local"
    test_pw = "SmartHireTest!2026"

    driver = build_driver()
    wait = WebDriverWait(driver, 15)
    try:
        print("1. Testing Landing Page & Responsive Layout...")
        driver.get(f"{FRONTEND_URL}/")
        wait.until(lambda d: "Great interviews aren't luck" in d.find_element(By.TAG_NAME, "body").text)
        for w, h in [(1440, 900), (768, 1024), (375, 812)]:
            driver.set_window_size(w, h)
            time.sleep(0.2)
            overflow = driver.execute_script("return document.documentElement.scrollWidth > document.documentElement.clientWidth;")
            assert not overflow, f"Horizontal overflow detected at {w}x{h}"
        driver.set_window_size(1440, 900)
        assert_no_console_errors(driver, "LandingPage")

        print("2. Testing Candidate Self-Registration -> Dashboard (zero mock data)...")
        driver.get(f"{FRONTEND_URL}/auth")
        reg_tab = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Create Account')]")))
        scroll_click(driver, reg_tab)
        type_text(driver, wait.until(EC.visibility_of_element_located((By.ID, "reg-name"))), "E2E Candidate")
        type_text(driver, driver.find_element(By.ID, "reg-email"), cand_email)
        type_text(driver, driver.find_element(By.ID, "reg-role"), "Full Stack Software Engineer")
        type_text(driver, driver.find_element(By.ID, "reg-password"), test_pw)
        scroll_click(driver, wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='register-btn']"))))
        wait.until(EC.url_contains("/dashboard"))
        wait.until(lambda d: "Candidate Workspace" in d.find_element(By.TAG_NAME, "body").text)
        assert_no_console_errors(driver, "DashboardPage")

        print("2b. Verifying Growth Journey shows honest empty state before resume/interview...")
        driver.get(f"{FRONTEND_URL}/growth")
        wait.until(lambda d: "No resume or interview assessment data yet" in d.find_element(By.TAG_NAME, "body").text)
        assert_no_console_errors(driver, "GrowthPageEmpty")

        print("3. Testing Resume ATS Analysis...")
        driver.get(f"{FRONTEND_URL}/resume")
        raw_box = wait.until(EC.visibility_of_element_located((By.ID, "resume-raw-text-input")))
        time.sleep(0.3)
        type_text(driver, raw_box, "Skills: Python, Django, React, PostgreSQL, Git, REST API. Education: B.Tech CS. Experience: Software Intern")
        analyze_btn = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='analyze-resume-btn']")))
        scroll_click(driver, analyze_btn)
        wait.until(lambda d: "pasted_resume.txt" in d.find_element(By.ID, "ats-result-filename").text)
        assert_no_console_errors(driver, "ResumePage")

        print("4. Testing Interview Setup Wizard (including manual custom target) & Studio...")
        driver.get(f"{FRONTEND_URL}/interview/setup")
        custom_toggle = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='custom-domain-toggle']")))
        scroll_click(driver, custom_toggle)
        custom_input = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, "[data-testid='custom-domain-input']")))
        type_text(driver, custom_input, "Distributed Backend Engineer")
        for _ in range(2):
            cont_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Continue')]")))
            scroll_click(driver, cont_btn)
            time.sleep(0.35)
        start_btn = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='start-interview-btn']")))
        scroll_click(driver, start_btn)
        wait.until(EC.url_contains("/interview/room/"))

        transcript_box = wait.until(EC.presence_of_element_located((By.ID, "live-transcript-input")))
        type_text(driver, transcript_box, "Object-oriented programming relies on encapsulation, abstraction, inheritance, and polymorphism.")
        scroll_click(driver, driver.find_element(By.CSS_SELECTOR, "[data-testid='next-question-btn']"))
        time.sleep(0.5)
        type_text(driver, driver.find_element(By.ID, "live-transcript-input"), "TCP uses a 3-way handshake for reliability while UDP is connectionless.")
        scroll_click(driver, driver.find_element(By.CSS_SELECTOR, "[data-testid='submit-interview-btn']"))
        wait.until(EC.url_contains("/insights"))
        wait.until(EC.presence_of_element_located((By.ID, "overall-score-display")))
        assert_no_console_errors(driver, "InsightsPage")

        print("5. Testing Certified Dossier, Growth Journey & RBAC...")
        driver.get(f"{FRONTEND_URL}/dossier")
        wait.until(EC.presence_of_element_located((By.ID, "dossier-paper")))
        driver.get(f"{FRONTEND_URL}/growth")
        wait.until(lambda d: "4-Week Remediation" in d.find_element(By.TAG_NAME, "body").text)
        driver.get(f"{FRONTEND_URL}/admin")
        wait.until(lambda d: "403 ACCESS RESTRICTED" in d.find_element(By.TAG_NAME, "main").text)

        print("6. Testing Initial Admin Setup & Admin Terminal...")
        scroll_click(driver, wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='logout-btn']"))))
        wait.until(EC.url_contains("/auth"))
        setup_tab = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Admin Setup')]")))
        scroll_click(driver, setup_tab)
        type_text(driver, wait.until(EC.visibility_of_element_located((By.ID, "adm-name"))), "E2E Administrator")
        type_text(driver, driver.find_element(By.ID, "adm-email"), admin_email)
        type_text(driver, driver.find_element(By.ID, "adm-pw"), test_pw)
        scroll_click(driver, wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='bootstrap-admin-btn']"))))
        wait.until(EC.url_contains("/admin"))
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#admin-log-console .console-line")))
        assert_no_console_errors(driver, "AdminPage")

        print("7. Testing Recruiter Provisioning & Recruiter Portal...")
        prov_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Provision User')]")))
        scroll_click(driver, prov_btn)
        modal_inputs = wait.until(lambda d: d.find_elements(By.CSS_SELECTOR, "[role='dialog'] input"))
        type_text(driver, modal_inputs[0], "E2E Recruiter")
        type_text(driver, modal_inputs[1], rec_email)
        role_select = driver.find_element(By.CSS_SELECTOR, "[role='dialog'] select")
        from selenium.webdriver.support.ui import Select
        Select(role_select).select_by_value("recruiter")
        type_text(driver, modal_inputs[2], test_pw)
        create_btn = driver.find_element(By.XPATH, "//div[@role='dialog']//button[@type='submit']")
        scroll_click(driver, create_btn)
        time.sleep(0.8)

        scroll_click(driver, wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='logout-btn']"))))
        wait.until(EC.url_contains("/auth"))
        type_text(driver, wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, "[data-testid='email']"))), rec_email)
        type_text(driver, driver.find_element(By.CSS_SELECTOR, "[data-testid='password']"), test_pw)
        scroll_click(driver, wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='login-btn']"))))
        wait.until(EC.url_contains("/recruiter"))
        wait.until(lambda d: "Recruiter Portal" in d.find_element(By.TAG_NAME, "body").text)
        assert_no_console_errors(driver, "RecruiterPage")

        print("\nALL REACT SPA + DJANGO ZERO-MOCK E2E CHECKS PASSED!")
    except Exception:
        import traceback
        traceback.print_exc()
        print("CURRENT URL:", driver.current_url)
        print("BROWSER LOGS:", driver.get_log("browser"))
        try:
            print("RAW VALUE:", driver.find_element(By.ID, "resume-raw-text-input").get_attribute("value"))
            print("FULL BODY TEXT:\n", driver.find_element(By.TAG_NAME, "body").text[-800:])
        except Exception:
            pass
        raise
    finally:
        driver.quit()
        cleanup_e2e_users()


if __name__ == "__main__":
    try:
        run_e2e()
    except Exception as exc:
        print(f"E2E FAILED: {exc!r}", file=sys.stderr)
        sys.exit(1)
