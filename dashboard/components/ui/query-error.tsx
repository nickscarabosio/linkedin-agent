import { AlertCircle } from "lucide-react";
import { Button } from "./button";

interface QueryErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function QueryError({ message = "Failed to load data", onRetry }: QueryErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
      <p className="text-sm text-gray-600 mb-4">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
