# GitHub Repository Scraper

A scalable GitHub repository scraper that analyzes commit history and generates a leaderboard of contributors. The project is built with a modern stack for both backend and frontend, featuring asynchronous processing with a task queue.

## Features

### Backend

- **Fastify Server**:
  - Implements multiple endpoints:
    - `/health`: Check server status.
    - `/leaderboard` (GET): Retrieve the leaderboard for a processed repository.
    - `/leaderboard` (POST): Submit a repository for processing.
    - `/repositories`: List all repositories in the database.
  - Handles repository states (`pending`, `in_progress`, `failed`, `completed`) dynamically.
- **Efficient Repository Management**:
  - Bare cloning and incremental updates using `simple-git`.
  - Normalizes repository URLs for consistent processing.
- **Task Queue**:
  - Asynchronous repository processing with Bull and Redis.
- **Database Integration**:
  - PostgreSQL for persistent caching of repositories and contributors.
  - Prisma ORM for structured and efficient database queries.
- **Error Handling**:
  - Graceful handling of invalid repository URLs, missing data, and processing failures.

### Frontend

- **Modern UI**: Built with Next.js and styled with Tailwind CSS.
- **Leaderboard Display**: Interactive table showing contributor rankings and commit counts.
- **Repository Management**: Add and monitor GitHub repositories through a responsive interface.

---

## Getting Started

### Prerequisites

Ensure the following tools are installed on your machine:

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- [Git](https://git-scm.com/)

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/aalexmrt/github-scraper
   cd github-scraper
   ```
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

     ```

3. **Start Services**:

   - Run the following command to build and start all services using Docker Compose:
     ```bash
     docker-compose up --build
     ```
   - This will start the backend, frontend, PostgreSQL database, Redis, and the worker service.

4. **Access the Application**:
   - **Backend API**: Accessible at `http://localhost:3000`
     - To verify if the backend is running, you can use the `/health` endpoint:
       ```bash
       curl -X GET "http://localhost:3000/health"
       ```
       - **Expected Response**:
         ```json
         { "message": "Server is running." }
         ```
   - **Frontend UI**: Accessible at `http://localhost:4000`

---

## Usage

### Submit a Repository for Processing

**Endpoint**: `/leaderboard`

**Method**: `POST`

#### Query Parameters

| Parameter | Type   | Description                          | Required |
| --------- | ------ | ------------------------------------ | -------- |
| `repoUrl` | string | The GitHub repository URL to process | Yes      |

#### Headers

| Header          | Type   | Description                           | Required |
| --------------- | ------ | ------------------------------------- | -------- |
| `Authorization` | string | Bearer token for private repositories | No       |

#### Example Request

```bash
curl -X POST "http://localhost:3000/leaderboard?repoUrl=https://github.com/aalexmrt/github-scraper"
```

### Responses

#### Repository Added for Processing

```json
{ "message": "Repository is being processed." }
```

#### Repository Already Processing

```json
{ "message": "Repository still processing." }
```

#### Processing Completed

```json
{
  "message": "Repository processed successfully.",
  "lastProcessedAt": "2024-11-28T12:00:00Z"
}
```

### Retrieve Leaderboard for a Processed Repository

**Endpoint**: `/leaderboard`

**Method**: `GET`

**URL**: `http://localhost:3000/leaderboard`

**Query Parameters**

| Parameter | Type   | Description                          | Required |
| --------- | ------ | ------------------------------------ | -------- |
| `repoUrl` | string | The GitHub repository URL to process | Yes      |

#### Example Request

```bash
curl -X GET "http://localhost:3000/leaderboard?repoUrl=https://github.com/aalexmrt/github-scraper"
```

#### Example Responses

##### Repository Not Found

```json
{
  "error": "Repository not found, remember to submit for processing first."
}
```

##### Leaderboard Response

```json
{
  "repository": "https://github.com/aalexmrt/github-scraper",
  "top_contributors": [
    {
      "identifier": "aalexmrt",
      "username": "aalexmrt",
      "email": "67644735+aalexmrt@users.noreply.github.com",
      "profileUrl": "https://github.com/aalexmrt",
      "commitCount": 23
    }
  ]
}
```

### Frontend: Using the Application

The application frontend provides an interface to interact with the backend, making it easier to process repositories and view leaderboards.

1. **Add a Repository**

   - Open the application frontend at `http://localhost:4000`.
   - Use the **Add Repository** form to submit a GitHub repository URL for processing.

2. **Monitor Repository Processing**

   - Navigate to the **Processed Repositories** section to view the status of your repositories:
     - **Processing**: The repository is currently being analyzed.
     - **On Queue**: The repository is waiting for processing.
     - **Completed**: The repository has been successfully processed.

3. **View Contributor Leaderboard**
   - For completed repositories, click the **Leaderboard** button to view a detailed contributor leaderboard.

<img width="1728" alt="Screenshot 2024-11-24 at 5 17 49 PM" src="https://github.com/user-attachments/assets/97ac4397-2556-44c5-89df-011133f6b455">
<img width="1728" alt="Screenshot 2024-11-24 at 5 18 03 PM" src="https://github.com/user-attachments/assets/200d80e1-59ed-4821-8a60-9a0f8807096f">

## **Next Steps**

### **Backend**

- [ ] Add support for private repositories with GitHub token validation in the `/leaderboard` endpoint.
- [ ] Update the /leaderboard endpoint to split responsibilities by creating a new endpoint for processing and retrieving the leaderboard, and include the repository URL in the response.

### **Frontend**

- [ ] Add a form to input a repository URL and optional GitHub token.
