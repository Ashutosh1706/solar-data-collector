import os
import subprocess
import sys
import time

git_path = r"C:\Program Files\Git\cmd\git.exe"
gh_path = r"C:\Program Files\GitHub CLI\gh.exe"

def main():
    print("="*60, flush=True)
    print(" AUTOMATED GITHUB & RENDER DEPLOYMENT ", flush=True)
    print("="*60, flush=True)

    # 1. Staging and committing files
    print("[+] Staging files...", flush=True)
    subprocess.run([git_path, "add", "."], capture_output=True)
    subprocess.run([git_path, "commit", "-m", "Prepare for Render persistent deployment"], capture_output=True)

    # 2. Spawn gh auth login
    print("[+] Starting GitHub authorization...", flush=True)
    p = subprocess.Popen(
        [gh_path, "auth", "login", "-p", "https", "-h", "github.com", "--web"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    # Read stderr in a loop to find the code
    code = None
    url = "https://github.com/login/device"
    
    # Read stderr line-by-line
    while True:
        line = p.stderr.readline()
        if not line:
            break
        print(f"GH_LOG: {line.strip()}", flush=True)
        if "one-time code:" in line:
            code = line.split("one-time code:")[-1].strip()
            print(f"\n[CODE_FOUND] Code: {code}", flush=True)
            print(f"[URL_FOUND] URL: {url}\n", flush=True)
            print("Please go to the URL above, enter the code, and click 'Authorize'. Waiting...", flush=True)
            break

    # Wait for the login process to complete
    # Keep reading remaining stderr/stdout to avoid hang
    stdout_data, stderr_data = p.communicate()
    
    # Print any extra logs
    if stdout_data:
        print(f"GH_STDOUT: {stdout_data}", flush=True)
    if stderr_data:
        print(f"GH_STDERR: {stderr_data}", flush=True)

    if p.returncode != 0:
        print(f"[-] GitHub authentication failed with return code {p.returncode}.", flush=True)
        sys.exit(1)

    print("\n[+] GitHub authentication successful!", flush=True)

    # Get username
    username_res = subprocess.run([gh_path, "api", "user", "--jq", ".login"], capture_output=True, text=True)
    username = username_res.stdout.strip()
    if not username:
        username = "YOUR_GITHUB_USERNAME"

    # Create Repo and Push
    repo_name = "solar-data-collector"
    print(f"\n[+] Creating private repository on GitHub: {repo_name}...", flush=True)
    
    create_repo_cmd = [gh_path, "repo", "create", repo_name, "--private", "--source=.", "--push"]
    res = subprocess.run(create_repo_cmd, capture_output=True, text=True)
    
    if res.returncode != 0:
        if "already exists" in res.stderr.lower() or "already exists" in res.stdout.lower():
            print(f"[+] Repository '{repo_name}' already exists on GitHub. Pushing changes...", flush=True)
            remote_url = f"https://github.com/{username}/{repo_name}.git"
            subprocess.run([git_path, "remote", "remove", "origin"], capture_output=True)
            subprocess.run([git_path, "remote", "add", "origin", remote_url])
            subprocess.run([git_path, "push", "-u", "origin", "main"])
        else:
            print(f"[-] Failed to create repository: {res.stderr}", flush=True)
            sys.exit(1)
    else:
        print("[+] Repository created and code pushed successfully!", flush=True)

    # Output Render deployment link
    deploy_url = f"https://render.com/deploy?repo=https://github.com/{username}/{repo_name}"
    print("\n" + "="*60, flush=True)
    print(" DEPLOYMENT READY! ", flush=True)
    print("="*60, flush=True)
    print(f"\n👉 [DEPLOY_URL_LINK] Link: {deploy_url}\n", flush=True)
    print("="*60, flush=True)

if __name__ == "__main__":
    main()
