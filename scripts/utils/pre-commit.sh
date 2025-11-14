#!/bin/bash
# Pre-commit script to run basic checks
# Add this to .git/hooks/pre-commit (or use husky)

set -e

echo "🔍 Running pre-commit checks..."

# Check for console.log in production code
echo "Checking for console.log statements..."
if grep -r "console\.log\|console\.warn\|console\.error" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules backend/src frontend/src 2>/dev/null | grep -v "logger\." | grep -v "//.*console"; then
  echo "❌ Found console.log statements. Use logger utility instead."
  echo "   See PRE_COMMIT_CHECKLIST.md for details."
  exit 1
fi

# Check for hardcoded secrets (basic check)
echo "Checking for potential secrets..."
if grep -r "password.*=.*['\"]" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules backend/src frontend/src 2>/dev/null | grep -v "process.env"; then
  echo "⚠️  Warning: Potential hardcoded password found. Review manually."
fi

# Check TypeScript compilation (backend)
echo "Checking backend TypeScript..."
cd backend
if ! npx tsc --noEmit > /dev/null 2>&1; then
  echo "❌ Backend TypeScript errors found. Run 'npx tsc --noEmit' for details."
  exit 1
fi
cd ..

# Check TypeScript compilation (frontend)
echo "Checking frontend TypeScript..."
cd frontend
if ! npx tsc --noEmit > /dev/null 2>&1; then
  echo "❌ Frontend TypeScript errors found. Run 'npx tsc --noEmit' for details."
  exit 1
fi
cd ..

echo "✅ Pre-commit checks passed!"

