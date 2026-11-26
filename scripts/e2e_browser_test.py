"""
SmartHire AI — Real Headless Chrome End-to-End Browser Verification
Tests full Candidate, Recruiter, and Admin workflows, zero JS console errors,
camera/mic denied graceful fallback, RBAC UI gating, and responsive viewports.
"""
import time
import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

FRONTEND_URL = "http://127.0.0.1:5500"


def build_driver():
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1440,900")
    # Deny camera & mic to verify graceful fallback without uncaught errors
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


def run_e2e():
    driver = build_driver()
    wait = WebDriverWait(driver, 12)
    try:
        print("1. Testing Index / Candidate Login...")
        driver.get(f"{FRONTEND_URL}/index.html")
        wait.until(EC.presence_of_element_located((By.ID, "login-btn")))
        assert_no_console_errors(driver, "index.html")

        driver.find_element(By.ID, "login-btn").click()
        wait.until(EC.url_contains("home.html"))
        wait.until(lambda d: "Completed" in d.find_element(By.ID, "hub-total-sessions").text)
        assert_no_console_errors(driver, "home.html")
        print("   -> Candidate landed on home.html with live DB telemetry.")

        print("2. Testing Responsive Layouts (1440, 768, 375) on home.html...")
        for w, h in [(1440, 900), (768, 1024), (375, 812)]:
            driver.set_window_size(w, h)
            time.sleep(0.2)
            overflow = driver.execute_script("return document.documentElement.scrollWidth > document.documentElement.clientWidth;")
            assert not overflow, f"Horizontal overflow detected at {w}x{h}"
        driver.set_window_size(1440, 900)
        print("   -> Zero horizontal overflow across desktop, tablet, mobile.")

        print("3. Testing Resume ATS Analysis -> Targeted Interview Flow...")
        driver.get(f"{FRONTEND_URL}/resume.html")
        wait.until(EC.presence_of_element_located((By.ID, "analyze-resume-btn")))
        wait.until(EC.visibility_of_element_located((By.ID, "ats-result-filename")))
        raw_box = driver.find_element(By.ID, "resume-raw-text-input")
        scroll_click(driver, raw_box)
        raw_box.send_keys("Skills: Python, Django, React, PostgreSQL, Git, REST API. Education: B.Tech CS. Experience: Software Intern")
        if not raw_box.get_attribute("value"):
            driver.execute_script("arguments[0].value = arguments[1];", raw_box, "Skills: Python, Django, React, PostgreSQL, Git, REST API.")
        analyze_btn = driver.find_element(By.ID, "analyze-resume-btn")
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", analyze_btn)
        time.sleep(0.25)
        driver.execute_script("arguments[0].click();", analyze_btn)
        wait.until(lambda d: "pasted_resume.txt" in d.find_element(By.ID, "ats-result-filename").text)
        assert_no_console_errors(driver, "resume.html")

        scroll_click(driver, driver.find_element(By.ID, "generate-targeted-interview-btn"))
        wait.until(EC.url_contains("interview.html"))
        print("   -> Resume analyzed and routed to targeted interview.html.")

        print("4. Testing Interview Room (Camera/Mic Denied Fallback) & Evaluation...")
        wait.until(EC.presence_of_element_located((By.ID, "start-interview-btn")))
        # Verify amber notice is gracefully shown when camera/mic are denied
        wait.until(EC.visibility_of_element_located((By.ID, "media-amber-notice")))
        scroll_click(driver, driver.find_element(By.ID, "start-interview-btn"))
        wait.until(EC.visibility_of_element_located((By.ID, "active-interview-room")))

        transcript_box = driver.find_element(By.ID, "live-transcript-input")
        transcript_box.send_keys("Object-oriented programming relies on encapsulation, abstraction, inheritance, and polymorphism via method overriding.")
        scroll_click(driver, driver.find_element(By.ID, "next-question-btn"))
        time.sleep(0.6)
        driver.find_element(By.ID, "live-transcript-input").send_keys("TCP ensures reliable delivery via 3-way handshake whereas UDP is connectionless for low latency streaming.")
        scroll_click(driver, driver.find_element(By.ID, "submit-interview-btn"))

        wait.until(EC.url_contains("insights.html"))
        wait.until(EC.visibility_of_element_located((By.ID, "insights-content")))
        score_text = driver.find_element(By.ID, "overall-score-display").text.strip()
        assert float(score_text) > 0
        assert_no_console_errors(driver, "insights.html")
        print(f"   -> Interview evaluated end-to-end! Overall score: {score_text}")

        print("5. Testing Certified Dossier Page & Skill Gap Roadmap...")
        scroll_click(driver, driver.find_element(By.ID, "download-dossier-link"))
        wait.until(EC.url_contains("report-download.html"))
        wait.until(EC.visibility_of_element_located((By.ID, "dossier-paper")))
        assert_no_console_errors(driver, "report-download.html")

        driver.get(f"{FRONTEND_URL}/skill-gap.html")
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".milestone-checkbox")))
        assert_no_console_errors(driver, "skill-gap.html")
        print("   -> Dossier & Skill Gap pages verified.")

        print("6. Testing RBAC Restriction for Candidate on Admin Page...")
        driver.get(f"{FRONTEND_URL}/admin.html")
        wait.until(lambda d: "403 ACCESS RESTRICTED" in d.find_element(By.TAG_NAME, "main").text)
        print("   -> Candidate properly blocked from admin.html.")

        print("7. Testing Recruiter Portal Login, Dossier Modal & Persistence...")
        driver.get(f"{FRONTEND_URL}/index.html")
        scroll_click(driver, wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".demo-chip[data-email='recruiter@demo.com']"))))
        scroll_click(driver, driver.find_element(By.ID, "login-btn"))
        wait.until(EC.url_contains("recruiter.html"))
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".candidate-row")))
        scroll_click(driver, driver.find_element(By.CSS_SELECTOR, ".candidate-row"))
        wait.until(EC.visibility_of_element_located((By.ID, "candidate-modal")))
        scroll_click(driver, driver.find_element(By.ID, "btn-shortlist"))
        time.sleep(0.5)
        assert_no_console_errors(driver, "recruiter.html")
        print("   -> Recruiter portal & dossier review verified.")

        print("8. Testing Admin Terminal Login & Live Diagnostics Console...")
        driver.get(f"{FRONTEND_URL}/index.html")
        scroll_click(driver, wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".demo-chip[data-email='admin@demo.com']"))))
        scroll_click(driver, driver.find_element(By.ID, "login-btn"))
        wait.until(EC.url_contains("admin.html"))
        wait.until(lambda d: "Accounts" in d.find_element(By.ID, "adm-users-count").text)
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#admin-log-console .console-line")))
        assert_no_console_errors(driver, "admin.html")
        print("   -> Admin terminal & real DB audit log console verified.")

        print("\nALL E2E BROWSER VERIFICATION CHECKS PASSED WITH ZERO CONSOLE ERRORS!")
    except Exception:
        print("DEBUG URL:", driver.current_url)
        print("DEBUG LOGS:", driver.get_log("browser"))
        try:
            print("DEBUG FILENAME:", driver.find_element(By.ID, "ats-result-filename").text)
            print("DEBUG BTN:", driver.find_element(By.ID, "analyze-resume-btn").text)
            print("DEBUG TOAST:", driver.find_element(By.ID, "toast-container").text)
        except Exception:
            pass
        raise
    finally:
        driver.quit()


if __name__ == "__main__":
    import traceback
    try:
        run_e2e()
    except Exception as exc:
        traceback.print_exc()
        print(f"E2E FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
