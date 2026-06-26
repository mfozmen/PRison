import { auth } from "@/auth";
import { SignInButton } from "@/components/SignInButton";

export default async function Home() {
  const session = await auth();

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <SignInButton />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-lg">Welcome, {session.login}</p>
    </div>
  );
}
