import { useState, type FormEvent } from "react";
import {
  useActionData,
  useNavigate,
  type ActionFunctionArgs,
  type MetaFunction,
} from "react-router";
import { checkPassword, createAuthResponse } from "~/auth/session";

export const meta: MetaFunction = () => [
  { title: "Login — Ontario Land Use Planning Agent" },
];

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const password = formData.get("password") as string;

  if (!password || !checkPassword(password)) {
    return { error: "Incorrect password. Please try again." };
  }

  return createAuthResponse("/");
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    setLoading(true);
    // Let the form submit normally; action will redirect on success
    // or return an error that we display below
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            ON
          </div>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">
            Ontario Land Use Planning Agent
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the access password to continue
          </p>
        </div>

        <form method="POST" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <input
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {actionData?.error && (
            <p className="text-sm text-destructive">{actionData.error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Preliminary assessment only. Consult a registered professional
          planner (RPP) for formal opinions.
        </p>
      </div>
    </div>
  );
}