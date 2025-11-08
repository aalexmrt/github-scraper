# Use Node.js LTS version
FROM node:22.11.0

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Copy application files
COPY . .

# Expose application port
EXPOSE 3000

# Run the development server
CMD ["pnpm", "run", "dev"]
