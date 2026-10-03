# FieldOS Build and Setup Guide

This guide explains how to install dependencies and build **FieldOS**, mirroring the automation steps from the original `Run-FieldOS.bat` script.

---

## Prerequisites

Before running the build steps, ensure you have the following installed on your system:
1. **Node.js and npm**: Required to manage project packages and build the application. You can download them from [nodejs.org](https://nodejs.org/).
2. **Project Files**: Ensure all FieldOS project files, including `package.json`, are in your main project folder.

---

## Build & Execution Instructions

Open your terminal (Command Prompt, PowerShell, or Bash) in the main FieldOS project directory and run the following steps:

### Step 1: Install Project Dependencies
This command checks for `package.json` and installs all necessary project modules via npm.

```bash
npm install
```

*If this step fails, verify that Node.js/npm are correctly installed and added to your system's PATH.*

---

### Step 2: Build FieldOS
Once the dependencies are installed successfully, build the application for production:

```bash
npm run build
```

---

## Success

Upon a successful build, check your project directory for the newly created **`dist`** folder, which contains your compiled application files.