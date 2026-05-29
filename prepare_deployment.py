import os
import subprocess
import sys
import shutil
import time

def find_executable(name, default_path):
    # First check PATH
    path = shutil.which(name)
    if path:
        return path
    # Check default Windows installation path
    if os.path.exists(default_path):
        return default_path
    return None

def install_via_winget(package_id, name):
    print(f"\n[+] {name} is not installed. Installing via winget...")
    cmd = f"winget install --no-upgrade {package_id} -e --silent --accept-source-agreements --accept-package-agreements"
    try:
        res = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode == 0:
            print(f"[+] Successfully installed {name}!")
            return True
        else:
            print(f"[-] Winget installation failed: {res.stderr}")
            return False
    except Exception as e:
        print(f"[-] Winget error: {e}")
        return False

def main():
    print("="*60)
    print(" NMTronics Solar Data Collector Cloud Deployment Preparer ")
    print("="*60)

    # 1. Locate/Install Git
    git_path = find_executable("git", r"C:\Program Files\Git\cmd\git.exe")
    if not git_path:
        if install_via_winget("Git.Git", "Git"):
            time.sleep(2)
            git_path = find_executable("git", r"C:\Program Files\Git\cmd\git.exe")
    
    if not git_path:
        print("\n[-] Git installation failed or not found. Please install Git manually from https://git-scm.com/ and restart this script.")
        sys.exit(1)
    
    print(f"[+] Git located at: {git_path}")

    # 2. Locate/Install GitHub CLI
    gh_path = find_executable("gh", r"C:\Program Files\GitHub CLI\gh.exe")
    if not gh_path:
        if install_via_winget("GitHub.cli", "GitHub CLI"):
            time.sleep(2)
            gh_path = find_executable("gh", r"C:\Program Files\GitHub CLI\gh.exe")

    if not gh_path:
        print("\n[-] GitHub CLI installation failed or not found. Please install it manually from https://cli.github.com/ and restart this script.")
        sys.exit(1)

    print(f"[+] GitHub CLI located at: {gh_path}")

    # 3. Configure Git Global Defaults if not set
    # This prevents git commit from failing due to missing name/email
    try:
        name_check = subprocess.run([git_path, "config", "--get", "user.name"], capture_output=True, text=True)
        if not name_check.stdout.strip():
            print("[+] Configuring default Git user name...")
            subprocess.run([git_path, "config", "--global", "user.name", "nmtronics-ashutosh"])
        
        email_check = subprocess.run([git_path, "config", "--get", "user.email"], capture_output=True, text=True)
        if not email_check.stdout.strip():
            print("[+] Configuring default Git user email...")
            subprocess.run([git_path, "config", "--global", "user.email", "dev@nmtronics.com"])
    except Exception as e:
        print(f"[-] Warning when setting git config: {e}")

    # 4. Initialize Git Repo
    if not os.path.exists(".git"):
        print("\n[+] Initializing Git repository...")
        subprocess.run([git_path, "init", "-b", "main"])
    else:
        print("\n[+] Git repository already initialized.")

    # 5. Commit Files
    print("[+] Staging and committing files...")
    subprocess.run([git_path, "add", "."])
    subprocess.run([git_path, "commit", "-m", "Prepare for Render persistent deployment"])

    # 6. Authenticate GitHub CLI
    print("\n" + "="*50)
    print(" ACTION REQUIRED: Log in to your GitHub account ")
    print("="*50)
    print("Please follow the terminal prompts to log in. Options to choose:")
    print("  1. What account? -> GitHub.com")
    print("  2. Preferred protocol? -> HTTPS")
    print("  3. Authenticate Git? -> Yes")
    print("  4. How to authenticate? -> Login with a web browser")
    print("  (A browser tab will open. Paste the 8-character code displayed in the terminal.)\n")
    
    # Run login interactively
    subprocess.run([gh_path, "auth", "login"], shell=True)

    # Verify authentication
    auth_check = subprocess.run([gh_path, "auth", "status"], capture_output=True, text=True)
    if "Logged in to github.com" not in auth_check.stderr and "Logged in to github.com" not in auth_check.stdout:
        print("\n[-] GitHub authentication failed. Please run this script again or run: gh auth login")
        sys.exit(1)

    print("\n[+] GitHub authentication successful!")

    # Get GitHub Username
    username = None
    try:
        user_res = subprocess.run([gh_path, "api", "user", "--jq", ".login"], capture_output=True, text=True)
        username = user_res.stdout.strip()
    except Exception:
        pass

    if not username:
        # Fallback parsing from auth status
        for line in (auth_check.stderr + auth_check.stdout).splitlines():
            if "Logged in to github.com as" in line:
                username = line.split("as")[-1].strip().split()[0]
                break

    if not username:
        print("[-] Could not retrieve GitHub username. Using fallback.")
        username = "YOUR_GITHUB_USERNAME"

    # 7. Create Repo and Push
    repo_name = "solar-data-collector"
    print(f"\n[+] Creating private repository on GitHub: {repo_name}...")
    
    create_repo_cmd = [gh_path, "repo", "create", repo_name, "--private", "--source=.", "--push"]
    res = subprocess.run(create_repo_cmd, capture_output=True, text=True)
    
    if res.returncode != 0:
        if "already exists" in res.stderr.lower() or "already exists" in res.stdout.lower():
            print(f"[+] Repository '{repo_name}' already exists on GitHub. Pushing changes...")
            # Set remote URL and push
            remote_url = f"https://github.com/{username}/{repo_name}.git"
            subprocess.run([git_path, "remote", "remove", "origin"], capture_output=True)
            subprocess.run([git_path, "remote", "add", "origin", remote_url])
            subprocess.run([git_path, "push", "-u", "origin", "main"])
        else:
            print(f"[-] Failed to create repository: {res.stderr}")
            sys.exit(1)
    else:
        print("[+] Repository created and code pushed successfully!")

    # 8. Output Render deployment link
    deploy_url = f"https://render.com/deploy?repo=https://github.com/{username}/{repo_name}"
    
    print("\n" + "="*60)
    print(" DEPLOYMENT READY! ")
    print("="*60)
    print("Your code has been successfully pushed to GitHub.")
    print("To launch your persistent 24/7 web application:")
    print(f"\n👉 CLICK THIS LINK TO DEPLOY:\n{deploy_url}\n")
    print("Render will automatically build and host the application.")
    print("It will create a Web Service and a free PostgreSQL Database.")
    print("Once finished, you will receive the final production URL!")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()
