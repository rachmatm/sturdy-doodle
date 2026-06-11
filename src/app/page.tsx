import LogoStudio from '@/components/LogoStudio';

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            AI Logo Generator
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Describe your business and generate logo concepts. Everything you
            create is saved to your gallery.
          </p>
        </header>
        <LogoStudio />
      </main>
    </div>
  );
}
