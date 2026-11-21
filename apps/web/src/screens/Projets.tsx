import { useEffect, useState, useCallback } from 'react';
import type { Employee, ProjectsResponse, User } from '../lib/api';
import { api, fetchProjects } from '../lib/api';
import { ProjectsView } from '../components/ProjectsView';
import { Banner, PageHeader, Spinner } from '../components/ui';

export default function Projets({
  user,
  permissions,
}: {
  user: User;
  permissions?: Record<string, boolean> | null;
}) {
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  const isDirection = user.role === 'direction';
  const canCreate = isDirection || Boolean(permissions?.['projects.create']);
  const canEdit = isDirection || Boolean(permissions?.['projects.edit']);
  const canDelete = isDirection || Boolean(permissions?.['projects.delete']);
  const canReportIncident = Boolean(permissions?.['projects.report_incident']);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const projRes = await fetchProjects();
      setData(projRes);
      setError(null);
      if (canCreate || canEdit) {
        try {
          const empRes = await api<{ employees: Employee[] }>('/api/projects/assignees');
          setEmployees(empRes.employees);
          setAssignmentError(null);
        } catch (employeeError) {
          setEmployees([]);
          setAssignmentError(employeeError instanceof Error ? employeeError.message : 'Liste des travailleurs indisponible.');
        }
      } else {
        setEmployees([]);
        setAssignmentError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement projets');
    } finally {
      setLoading(false);
    }
  }, [canCreate, canEdit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      {/* En-tête de la page Unifié (Standard CFTM) */}
      <div className="hidden sm:block">
        <PageHeader
          title="Commandes & Chantiers"
          hint="Vue opérationnelle pour suivre les commandes en cours, les équipes affectées et les échéances"
          eyebrow="Atelier · Projets · Interventions"
        />
      </div>
      <div className="sm:hidden border-b border-line pb-2 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Atelier · Projets</p>
        <h1 className="text-lg font-bold text-ink">Commandes &amp; chantiers</h1>
      </div>

      {error && <Banner tone="error">{error}</Banner>}
      {assignmentError && <Banner tone="error">Impossible de charger les travailleurs à affecter : {assignmentError}</Banner>}

      {loading && !data ? (
        <div className="grid h-64 place-items-center">
          <Spinner />
        </div>
      ) : (
        <ProjectsView
          data={data}
          employees={employees}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          canReportIncident={canReportIncident}
          currentEmployeeId={user.employee_id}
          onRefresh={loadData}
        />
      )}
    </div>
  );
}
