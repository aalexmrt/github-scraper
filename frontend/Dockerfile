# Use Node.js LTS version
FROM node:22.11.0

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --force

# Copy application files
COPY . .

# Expose application port
EXPOSE 3000

# Run the development server
CMD ["npm", "run", "dev"]
