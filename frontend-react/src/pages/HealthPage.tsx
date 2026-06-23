/**
 * Health page: placeholder for Phase 3 (sleep, stress, body battery, resting HR metrics).
 */
import { Card } from '../components/ui/Card';

export function HealthPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Health</h1>
      <Card>
        <p className="text-sm text-gray-500">
          Sleep, stress, body battery, and resting HR — coming in Phase 3.
        </p>
      </Card>
    </div>
  );
}
