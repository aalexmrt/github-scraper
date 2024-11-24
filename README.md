# GitHub Repository Scraper

A scalable GitHub repository scraper that analyzes commit history and generates a leaderboard of contributors. The project is built with a modern stack for both backend and frontend, featuring asynchronous processing with a task queue.

## Features

### Backend
- **Fastify Server**: Single endpoint for repository processing and leaderboard generation.
- **Asynchronous Processing**: Uses Bull and Redis for task queue management.
- **Efficient Cloning**: Bare cloning and incremental updates with `simple-git`.
- **Caching**: PostgreSQL and Prisma for caching contributor data and reducing redundant API calls.

### Frontend
- **Modern UI**: Built with Next.js and styled with Tailwind CSS.
- **Leaderboard Display**: Interactive table showing contributor rankings and commit counts.
- **Repository Management**: Add and monitor GitHub repositories through a responsive interface.

---

## Getting Started

### Prerequisites

Ensure the following tools are installed on your machine:
- [Node.js](https://nodejs.org/) (v18+)
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- [Git](https://git-scm.com/)

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/aalexmrt/github-scraper
   cd github-scraper
2. **Set Up Environment Variables**:
   - A sample `.env.example` file is provided in the `backend` folder. You can copy this file to create your `.env` file.
     ```bash
     cp backend/.env.example backend/.env
     ```
   - Open the newly created `backend/.env` file and replace `<your_github_personal_access_token>` with your GitHub Personal Access Token.
     Example `backend/.env` file:
     ```env
     # Database connection string
     DATABASE_URL=postgresql://user:password@db:5432/github_scraper

     # Redis connection settings
     REDIS_HOST=redis
     REDIS_PORT=6379

     # GitHub API Personal Access Token
     GITHUB_TOKEN=<your_github_personal_access_token>
     ```

   - **Note**: The `backend/.env.example` file includes placeholder values to guide you. Ensure the actual `.env` file is not shared or committed to version control to keep sensitive data secure.

   - If you don't have a GitHub Personal Access Token yet, you can create one:
     1. Go to [GitHub Developer Settings](https://github.com/settings/tokens).
     2. Click "Generate new token" (classic).
     3. Select the necessary scopes (`read:user` and `repo` for private repository access if required).
     4. Copy the token and add it to the `GITHUB_TOKEN` variable in your `backend/.env` file.


     ```

3. **Start Services**:
   - Run the following command to build and start all services using Docker Compose:
     ```bash
     docker-compose up --build
     ```
   - This will start the backend, frontend, PostgreSQL database, Redis, and the worker service.

4. **Access the Application**:
   - **Backend API**: Accessible at `http://localhost:3000`
   - **Frontend UI**: Accessible at `http://localhost:4000`

---

## Usage

### 1. Add a Repository
- Open the application frontend at `http://localhost:4000`.
- Use the **Add Repository** form to submit a GitHub repository URL for processing.

### 2. Monitor Repository Processing
- Navigate to the **Processed Repositories** section to view the status of your repositories:
  - **Processing**: The repository is currently being analyzed.
  - **On Queue**: The repository is waiting for processing.
  - **Completed**: The repository has been successfully processed.

### 3. View Contributor Leaderboard
- Click on the **Leaderboard** button for a completed repository to view a detailed contributor leaderboard.

---

Let me know if you'd like further refinements or additional sections! 🚀
