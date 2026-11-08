param([string]$Entrada, [string]$Saida, [int]$LinhaIni = 9)
$NAVY = 5256479; $GOLD = 3908041; $SLATE = 7888202; $GREEN = 5995822; $RED = 1582004; $AMBER = 43232; $GRAY = 11510684; $NAVY2 = 7031340; $INK = 3351067; $GRID = 15460827
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.ScreenUpdating = $false
function Estilo($ch) {
  $ch.ChartArea.Format.Line.Visible = 0
  $ch.ChartArea.Format.Fill.ForeColor.RGB = 16777215
  $ch.ChartArea.Font.Name = "Segoe UI"; $ch.ChartArea.Font.Size = 9; $ch.ChartArea.Font.Color = $INK
}
try {
  $wb = $xl.Workbooks.Open($Entrada)
  $xl.CalculateFull()
  $p = $wb.Worksheets.Item("Painel")
  $pos = { param($a) $r = $p.Range($a); @($r.Left, $r.Top, $r.Width, $r.Height) }

  # 1) Receita x impostos x guias por mês
  $g = & $pos "B16:J32"
  $ch = $p.ChartObjects().Add($g[0], $g[1], $g[2], $g[3]).Chart
  $ch.ChartType = 51; $ch.SetSourceData($p.Range("U5:X17")); Estilo $ch
  $s1 = $ch.SeriesCollection(1); $s1.Format.Fill.ForeColor.RGB = $NAVY
  $s2 = $ch.SeriesCollection(2); $s2.ChartType = 65; $s2.AxisGroup = 2; $s2.Format.Line.ForeColor.RGB = $GOLD; $s2.Format.Line.Weight = 2.5; $s2.MarkerStyle = 8; $s2.MarkerSize = 5; $s2.MarkerBackgroundColor = $GOLD; $s2.MarkerForegroundColor = $GOLD
  $s3 = $ch.SeriesCollection(3); $s3.ChartType = 65; $s3.AxisGroup = 2; $s3.Format.Line.ForeColor.RGB = $SLATE; $s3.Format.Line.Weight = 1.75; $s3.Format.Line.DashStyle = 4; $s3.MarkerStyle = 8; $s3.MarkerSize = 4; $s3.MarkerBackgroundColor = $SLATE; $s3.MarkerForegroundColor = $SLATE
  $ch.ChartGroups(1).GapWidth = 60; $ch.HasLegend = $true; $ch.Legend.Position = -4107
  foreach ($ax in @($ch.Axes(2, 1), $ch.Axes(2, 2))) { $ax.DisplayUnit = -3; $ax.HasDisplayUnitLabel = $true; $ax.DisplayUnitLabel.Text = "mil R$"; $ax.TickLabels.NumberFormatLocal = "#.##0" }
  $ch.Axes(2, 1).MajorGridlines.Format.Line.ForeColor.RGB = $GRID
  $ch.Axes(1).TickLabels.NumberFormat = "mmm"

  # 2) Composição dos impostos do mês (rosca)
  $g = & $pos "L16:R32"
  $ch = $p.ChartObjects().Add($g[0], $g[1], $g[2], $g[3]).Chart
  $ch.ChartType = -4120; $ch.SetSourceData($p.Range("U19:V24")); Estilo $ch
  $ch.ChartGroups(1).DoughnutHoleSize = 58
  $cores = @($NAVY, $NAVY2, $GOLD, $SLATE, $GRAY); $s = $ch.SeriesCollection(1)
  for ($i = 1; $i -le 5; $i++) { $s.Points($i).Format.Fill.ForeColor.RGB = $cores[$i - 1]; $s.Points($i).Format.Line.ForeColor.RGB = 16777215 }
  $s.HasDataLabels = $true; $s.DataLabels().ShowValue = $false; $s.DataLabels().ShowPercentage = $true; $s.DataLabels().Font.Color = 16777215; $s.DataLabels().Font.Bold = $true
  $ch.HasLegend = $true; $ch.Legend.Position = -4152

  # 3) Situação das guias (barras)
  $g = & $pos "B36:J51"
  $ch = $p.ChartObjects().Add($g[0], $g[1], $g[2], $g[3]).Chart
  $ch.ChartType = 57; $ch.SetSourceData($p.Range("U26:V30")); Estilo $ch
  $s = $ch.SeriesCollection(1); $cs = @($GREEN, $AMBER, $SLATE, $GRAY)
  for ($i = 1; $i -le 4; $i++) { $s.Points($i).Format.Fill.ForeColor.RGB = $cs[$i - 1] }
  $s.HasDataLabels = $true; $ch.HasLegend = $false; $ch.ChartGroups(1).GapWidth = 50; $ch.Axes(1).ReversePlotOrder = $true
  $ch.Axes(2).MajorGridlines.Format.Line.ForeColor.RGB = $GRID

  # 4) Retenções do mês (colunas)
  $g = & $pos "L36:R51"
  $ch = $p.ChartObjects().Add($g[0], $g[1], $g[2], $g[3]).Chart
  $ch.ChartType = 51; $ch.SetSourceData($p.Range("U32:V37")); Estilo $ch
  $s = $ch.SeriesCollection(1); $s.Format.Fill.ForeColor.RGB = $NAVY2; $s.HasDataLabels = $true; $s.DataLabels().NumberFormatLocal = "#.##0"
  $ch.HasLegend = $false; $ch.ChartGroups(1).GapWidth = 60
  $ch.Axes(2).MajorGridlines.Format.Line.ForeColor.RGB = $GRID; $ch.Axes(2).TickLabels.NumberFormatLocal = "#.##0"

  for ($i = 1; $i -le $p.ChartObjects().Count; $i++) { $c = $p.ChartObjects($i); $c.Chart.HasTitle = $true; $c.Chart.HasTitle = $false; $c.Placement = 2 }
  $p.Range("U4:X38").Font.Color = $GRAY

  # Empresa: receita x impostos (só as linhas de mês, sem os subtotais do trimestre)
  $e = $wb.Worksheets.Item("Empresa")
  $r = $e.Range("Z7:AH24")
  $ch = $e.ChartObjects().Add($r.Left, $r.Top, $r.Width, $r.Height).Chart
  $ch.ChartType = 51; $ch.SetSourceData($e.Range("Z28:AB40"))
  $sa = $ch.SeriesCollection(1); $sa.Format.Fill.ForeColor.RGB = $NAVY
  $sb = $ch.SeriesCollection(2); $sb.ChartType = 65; $sb.AxisGroup = 2; $sb.Format.Line.ForeColor.RGB = $GOLD; $sb.Format.Line.Weight = 2.5; $sb.MarkerStyle = 8; $sb.MarkerSize = 5; $sb.MarkerBackgroundColor = $GOLD; $sb.MarkerForegroundColor = $GOLD
  Estilo $ch
  $ch.HasTitle = $true; $ch.ChartTitle.Text = "Receita e guias a emitir no ano"; $ch.ChartTitle.Font.Size = 11; $ch.ChartTitle.Font.Bold = $true; $ch.ChartTitle.Font.Color = $NAVY
  $ch.HasLegend = $true; $ch.Legend.Position = -4107; $ch.ChartGroups(1).GapWidth = 60
  $ch.Axes(2, 1).MajorGridlines.Format.Line.ForeColor.RGB = $GRID
  $ch.Axes(2, 1).TickLabels.NumberFormatLocal = "#.##0"; $ch.Axes(2, 2).TickLabels.NumberFormatLocal = "#.##0"

  $f = $wb.Worksheets.Item("Fechamento"); $f.Outline.SummaryColumn = 0; $f.Outline.ShowLevels(0, 1)
  $p.Activate(); $p.Range("C5").Select()
  $wb.SaveAs($Saida, 51)
  $wb.Close($false)
  "ok"
} finally { $xl.ScreenUpdating = $true; $xl.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null }
