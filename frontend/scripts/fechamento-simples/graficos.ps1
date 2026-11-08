param([string]$Entrada, [string]$Saida)
$NAVY = 5256479; $GOLD = 3908041; $SLATE = 7888202; $GREEN = 5995822; $ORANGE = 542645; $RED = 1582004; $AMBER = 43232; $GRAY = 11510684; $NAVY2 = 7031340; $INK = 3351067
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.ScreenUpdating = $false
function Estilo($ch, $titulo) {
  $ch.HasTitle = $false
  $ch.ChartArea.Format.Line.Visible = 0
  $ch.ChartArea.Format.Fill.ForeColor.RGB = 16777215
  $ch.ChartArea.Font.Name = "Segoe UI"; $ch.ChartArea.Font.Size = 9; $ch.ChartArea.Font.Color = $INK
}
try {
  $wb = $xl.Workbooks.Open($Entrada)
  $xl.CalculateFull()
  $p = $wb.Worksheets.Item("Painel")
  $pos = { param($a) $r = $p.Range($a); @($r.Left, $r.Top, $r.Width, $r.Height) }

  # 1) Receita x DAS (colunas + linhas)
  $g = & $pos "B16:J31"
  $co = $p.ChartObjects().Add($g[0], $g[1], $g[2], $g[3]); $ch = $co.Chart
  $ch.ChartType = 51
  $ch.SetSourceData($p.Range("U5:X17"))
  Estilo $ch ""
  $s1 = $ch.SeriesCollection(1); $s1.Format.Fill.ForeColor.RGB = $NAVY; $s1.Name = "Receita"
  $s2 = $ch.SeriesCollection(2); $s2.ChartType = 65; $s2.AxisGroup = 2; $s2.Format.Line.ForeColor.RGB = $GOLD; $s2.Format.Line.Weight = 2.5; $s2.MarkerBackgroundColor = $GOLD; $s2.MarkerForegroundColor = $GOLD; $s2.MarkerStyle = 8; $s2.MarkerSize = 5; $s2.Name = "DAS calculado"
  $s3 = $ch.SeriesCollection(3); $s3.ChartType = 65; $s3.AxisGroup = 2; $s3.Format.Line.ForeColor.RGB = $SLATE; $s3.Format.Line.Weight = 1.75; $s3.Format.Line.DashStyle = 4; $s3.MarkerStyle = 8; $s3.MarkerSize = 4; $s3.MarkerBackgroundColor = $SLATE; $s3.MarkerForegroundColor = $SLATE; $s3.Name = "DAS declarado"
  $ch.ChartGroups(1).GapWidth = 60
  $ch.HasLegend = $true; $ch.Legend.Position = -4107
  foreach ($ax in @($ch.Axes(2, 1), $ch.Axes(2, 2))) { $ax.DisplayUnit = -3; $ax.HasDisplayUnitLabel = $true; $ax.DisplayUnitLabel.Text = "mil R$"; $ax.TickLabels.NumberFormatLocal = "#.##0" }
  $ch.Axes(2, 1).MajorGridlines.Format.Line.ForeColor.RGB = 15460827
  $ch.Axes(1).TickLabels.NumberFormat = "mmm"

  # 2) SituaÃ§Ã£o (rosca)
  $g = & $pos "L16:R31"
  $co = $p.ChartObjects().Add($g[0], $g[1], $g[2], $g[3]); $ch = $co.Chart
  $ch.ChartType = -4120
  $ch.SetSourceData($p.Range("U19:V25"))
  Estilo $ch ""
  $ch.ChartGroups(1).DoughnutHoleSize = 58
  $cores = @($GREEN, $ORANGE, $RED, $AMBER, $SLATE, $GRAY)
  $s = $ch.SeriesCollection(1)
  for ($i = 1; $i -le 6; $i++) { $s.Points($i).Format.Fill.ForeColor.RGB = $cores[$i - 1]; $s.Points($i).Format.Line.ForeColor.RGB = 16777215 }
  $s.HasDataLabels = $true; $s.DataLabels().ShowValue = $true; $s.DataLabels().ShowCategoryName = $false; $s.DataLabels().Font.Color = 16777215; $s.DataLabels().Font.Bold = $true
  $ch.HasLegend = $true; $ch.Legend.Position = -4152

  # 3) Anexo aplicado (barras)
  $g = & $pos "B36:J51"
  $co = $p.ChartObjects().Add($g[0], $g[1], $g[2], $g[3]); $ch = $co.Chart
  $ch.ChartType = 57
  $ch.SetSourceData($p.Range("U26:V29"))
  Estilo $ch ""
  $s = $ch.SeriesCollection(1); $s.Points(1).Format.Fill.ForeColor.RGB = $NAVY; $s.Points(2).Format.Fill.ForeColor.RGB = $GOLD; $s.Points(3).Format.Fill.ForeColor.RGB = $SLATE
  $s.HasDataLabels = $true; $ch.HasLegend = $false; $ch.ChartGroups(1).GapWidth = 50
  $ch.Axes(1).ReversePlotOrder = $true
  $ch.Axes(2).MajorGridlines.Format.Line.ForeColor.RGB = 15460827

  # 4) Faixa de RBT12 (colunas)
  $g = & $pos "L36:R51"
  $co = $p.ChartObjects().Add($g[0], $g[1], $g[2], $g[3]); $ch = $co.Chart
  $ch.ChartType = 51
  $ch.SetSourceData($p.Range("U31:V37"))
  Estilo $ch ""
  $s = $ch.SeriesCollection(1); $s.Format.Fill.ForeColor.RGB = $NAVY2; $s.HasDataLabels = $true
  $ch.HasLegend = $false; $ch.ChartGroups(1).GapWidth = 60
  $ch.Axes(2).MajorGridlines.Format.Line.ForeColor.RGB = 15460827

  # dados auxiliares em cinza discreto
  $p.Range("U4:X38").Font.Color = $GRAY
  $p.Rows(34).RowHeight = 24; $p.Rows(15).RowHeight = 24

  # Empresa: receita x DAS do ano
  $e = $wb.Worksheets.Item("Empresa")
  $r = $e.Range("V7:AD22")
  $co = $e.ChartObjects().Add($r.Left, $r.Top, $r.Width, $r.Height); $ch = $co.Chart
  $ch.ChartType = 51
  $sc = $ch.SeriesCollection().NewSeries(); $sc.Name = "Receita"; $sc.Values = $e.Range("J9:J20"); $sc.XValues = $e.Range("B9:B20"); $sc.Format.Fill.ForeColor.RGB = $NAVY
  $sd = $ch.SeriesCollection().NewSeries(); $sd.Name = "DAS calculado"; $sd.Values = $e.Range("Q9:Q20"); $sd.XValues = $e.Range("B9:B20"); $sd.ChartType = 65; $sd.AxisGroup = 2; $sd.Format.Line.ForeColor.RGB = $GOLD; $sd.Format.Line.Weight = 2.5; $sd.MarkerStyle = 8; $sd.MarkerSize = 5; $sd.MarkerBackgroundColor = $GOLD; $sd.MarkerForegroundColor = $GOLD
  Estilo $ch ""
  $ch.HasTitle = $true; $ch.ChartTitle.Text = "Receita e DAS calculado no ano"; $ch.ChartTitle.Font.Size = 11; $ch.ChartTitle.Font.Bold = $true; $ch.ChartTitle.Font.Color = $NAVY
  $ch.HasLegend = $true; $ch.Legend.Position = -4107; $ch.ChartGroups(1).GapWidth = 60
  $ch.Axes(2, 1).MajorGridlines.Format.Line.ForeColor.RGB = 15460827

  for ($i = 1; $i -le $p.ChartObjects().Count; $i++) { $c = $p.ChartObjects($i); $c.Chart.HasTitle = $true; $c.Chart.HasTitle = $false; $c.Placement = 2 }
  $ec = $e.ChartObjects(1).Chart; $ec.HasTitle = $true; $ec.ChartTitle.Text = "Receita e DAS calculado no ano"
  $ec.Axes(2, 1).DisplayUnit = -3; $ec.Axes(2, 1).TickLabels.NumberFormatLocal = "#.##0"; $ec.Axes(2, 2).TickLabels.NumberFormatLocal = "#.##0"
  $f = $wb.Worksheets.Item("Fechamento"); $f.Outline.SummaryColumn = 0; $f.Outline.ShowLevels(0, 1)
  $p.Activate(); $p.Range("C5").Select()
  $wb.SaveAs($Saida, 51)
  $wb.Close($false)
  "ok"
} finally { $xl.ScreenUpdating = $true; $xl.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null }
