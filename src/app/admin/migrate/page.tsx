"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Play, Loader2, CheckCircle, XCircle, AlertTriangle, ImageIcon, RefreshCw } from "lucide-react";

interface MigrationResult {
  message: string;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
  results: {
    processed: number;
    skipped: number;
    errors: number;
    details: Array<{
      id: string;
      status: string;
      path?: string;
      error?: string;
    }>;
  };
}

interface MigrationState {
  status: "idle" | "checking" | "running" | "completed" | "error";
  totalImages: number;
  processedTotal: number;
  skippedTotal: number;
  errorsTotal: number;
  currentBatch: number;
  error: string | null;
  log: string[];
}

export default function MigratePage() {
  const [state, setState] = useState<MigrationState>({
    status: "idle",
    totalImages: 0,
    processedTotal: 0,
    skippedTotal: 0,
    errorsTotal: 0,
    currentBatch: 0,
    error: null,
    log: [],
  });

  const addLog = useCallback((message: string) => {
    setState(prev => ({
      ...prev,
      log: [...prev.log, `[${new Date().toLocaleTimeString("da-DK")}] ${message}`],
    }));
  }, []);

  const checkStatus = useCallback(async () => {
    setState(prev => ({ ...prev, status: "checking", error: null }));
    
    try {
      // First do a dry run to see what needs processing
      const response = await fetch("/api/migrate-thumbnails?dryRun=true&limit=1000", {
        method: "POST",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Kunne ikke hente status");
      }
      
      const data: MigrationResult = await response.json();
      
      setState(prev => ({
        ...prev,
        status: "idle",
        totalImages: data.total,
        processedTotal: data.results.skipped, // Already have thumbnails
        skippedTotal: 0,
        errorsTotal: 0,
        log: [
          `Fandt ${data.total} billeder i alt`,
          `${data.results.skipped} har allerede karrusel-thumbnails`,
          `${data.results.processed} mangler karrusel-thumbnails`,
        ],
      }));
      
    } catch (err) {
      setState(prev => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Ukendt fejl",
      }));
    }
  }, []);

  const runMigration = useCallback(async () => {
    setState(prev => ({
      ...prev,
      status: "running",
      processedTotal: 0,
      skippedTotal: 0,
      errorsTotal: 0,
      currentBatch: 0,
      error: null,
      log: ["Starter migrering..."],
    }));
    
    const BATCH_SIZE = 5; // Process 5 images at a time to avoid timeouts
    let offset = 0;
    let hasMore = true;
    let batchNumber = 0;
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    while (hasMore) {
      batchNumber++;
      
      try {
        addLog(`Behandler batch ${batchNumber} (offset: ${offset})...`);
        
        const response = await fetch(
          `/api/migrate-thumbnails?limit=${BATCH_SIZE}&offset=${offset}`,
          { method: "POST" }
        );
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Batch ${batchNumber} fejlede`);
        }
        
        const data: MigrationResult = await response.json();
        
        totalProcessed += data.results.processed;
        totalSkipped += data.results.skipped;
        totalErrors += data.results.errors;
        
        setState(prev => ({
          ...prev,
          currentBatch: batchNumber,
          processedTotal: totalProcessed,
          skippedTotal: totalSkipped,
          errorsTotal: totalErrors,
          totalImages: data.total,
        }));
        
        addLog(
          `Batch ${batchNumber}: ${data.results.processed} behandlet, ` +
          `${data.results.skipped} sprunget over, ${data.results.errors} fejl`
        );
        
        // Log any errors
        data.results.details
          .filter(d => d.status === "error")
          .forEach(d => addLog(`  ❌ Fejl: ${d.error}`));
        
        hasMore = data.hasMore;
        offset = data.nextOffset ?? offset + BATCH_SIZE;
        
        // Small delay between batches to avoid overwhelming the server
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (err) {
        addLog(`❌ Fejl i batch ${batchNumber}: ${err instanceof Error ? err.message : "Ukendt fejl"}`);
        
        // Continue with next batch despite errors
        offset += BATCH_SIZE;
        totalErrors++;
        
        setState(prev => ({
          ...prev,
          errorsTotal: totalErrors,
        }));
      }
    }
    
    addLog("✅ Migrering afsluttet!");
    addLog(`Resultat: ${totalProcessed} behandlet, ${totalSkipped} sprunget over, ${totalErrors} fejl`);
    
    setState(prev => ({
      ...prev,
      status: "completed",
    }));
    
  }, [addLog]);

  const progress = state.totalImages > 0
    ? Math.round(((state.processedTotal + state.skippedTotal) / state.totalImages) * 100)
    : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-navy">Migrer Karrusel-Thumbnails</h1>
          <p className="text-muted-foreground">
            Generer optimerede thumbnails til eksisterende billeder
          </p>
        </div>
      </div>

      {/* Info card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-saffron" />
            Hvad gør dette værktøj?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Dette værktøj genererer små, optimerede thumbnails (maks 640x640px) til alle 
            eksisterende billeder i databasen. Disse thumbnails bruges i rejsekortet 
            karrusellen for hurtigere indlæsning.
          </p>
          <p>
            <strong>Bemærk:</strong> Nye billeder får automatisk genereret thumbnails ved upload.
            Du behøver kun køre dette én gang for at migrere eksisterende billeder.
          </p>
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Kør kun på et stille tidspunkt</p>
              <p className="text-amber-700">
                Processen bruger båndbredde og serverressourcer. 
                Det anbefales at køre den når der ikke er mange besøgende.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            {state.status === "idle" && "Klik 'Tjek status' for at se hvad der skal behandles"}
            {state.status === "checking" && "Tjekker status..."}
            {state.status === "running" && `Kører batch ${state.currentBatch}...`}
            {state.status === "completed" && "Migrering afsluttet!"}
            {state.status === "error" && "Der opstod en fejl"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Progress stats */}
          {state.totalImages > 0 && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-navy">{state.totalImages}</div>
                <div className="text-xs text-muted-foreground">Total billeder</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{state.processedTotal}</div>
                <div className="text-xs text-muted-foreground">Behandlet</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{state.skippedTotal}</div>
                <div className="text-xs text-muted-foreground">Havde allerede</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{state.errorsTotal}</div>
                <div className="text-xs text-muted-foreground">Fejl</div>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {state.status === "running" && (
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-1">
                <span>Fremgang</span>
                <span>{progress}%</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-saffron transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {state.error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 mb-6">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                <span className="font-medium">Fejl:</span>
                {state.error}
              </div>
            </div>
          )}

          {/* Success message */}
          {state.status === "completed" && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 mb-6">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Migrering gennemført!</span>
              </div>
              <p className="mt-1 text-sm">
                {state.processedTotal} billeder fik nye thumbnails, 
                {state.skippedTotal} havde allerede thumbnails.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              onClick={checkStatus}
              variant="outline"
              disabled={state.status === "running" || state.status === "checking"}
              className="gap-2"
            >
              {state.status === "checking" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Tjek status
            </Button>
            
            <Button
              onClick={runMigration}
              disabled={state.status === "running" || state.status === "checking"}
              className="gap-2"
            >
              {state.status === "running" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Kører...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start migrering
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Log output */}
      {state.log.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm max-h-80 overflow-y-auto">
              {state.log.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {line}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
