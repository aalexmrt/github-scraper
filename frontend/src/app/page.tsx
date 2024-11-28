import { RepositoryForm } from '@/components/RepositoryForm';
import { RepositoriesTable } from '@/components/RepositoriesTable';
import { RepositoryProvider } from '@/context/RepositoryContext';
export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen pb-20 gap-16 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <RepositoryProvider>
          <RepositoryForm />
          <RepositoriesTable />
        </RepositoryProvider>
      </main>
    </div>
  );
}
