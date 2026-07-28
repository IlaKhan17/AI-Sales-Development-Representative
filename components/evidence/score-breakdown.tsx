import type { ProspectScore } from '@/lib/api-types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const COMPONENT_LABELS: Record<string, string> = {
  role: 'Role match',
  industry: 'Industry',
  company_size: 'Company size',
  geography: 'Geography',
  buying_signals: 'Buying signals',
  technology: 'Technology',
};

export function ScoreBreakdown({ score }: { score: ProspectScore | null }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Score Breakdown</CardTitle>
          <CardDescription>
            Evidence-grounded component scores against the campaign ICP.
          </CardDescription>
        </div>
        {score && (
          <div className="text-right">
            <div className="text-3xl font-bold tabular-nums">{score.total}</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Total
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!score ? (
          <p className="text-sm text-muted-foreground">
            Not yet scored. Scores appear once the research and scoring steps
            complete.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead className="w-28">Points</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(score.component_scores).map(
                  ([key, component]) =>
                    component && (
                      <TableRow key={key}>
                        <TableCell className="font-medium">
                          {COMPONENT_LABELS[key] ?? key}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {component.points} / {component.max}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {component.reason || '—'}
                        </TableCell>
                      </TableRow>
                    )
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
