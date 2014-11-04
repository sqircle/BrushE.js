brushE = undefined

colorChanged = ->
  color = new one.color($('#color').val())
  brushE.brush.setSettings(
    color_h: base_value: color.hue()
    color_s: base_value: color.saturation()
    color_v: base_value: color.value()
  )

selectBrush = ->
  brushName = $('#brushselector').val()

  script = document.createElement('script');
  script.setAttribute('src','dist/brushes/'+brushName+'.myb.js')
  script.setAttribute('id','brushscript')

  document.documentElement.firstChild.appendChild(script)
  loadbrush = "brushE.setBrush(#{brushName}); colorChanged();"
  setTimeout(loadbrush, 1000)

$(document).ready ->
  canvas  = $('#paintCanvas')[0]
  brushE = new BrushE(canvas, charcoal)
  
  $('#color').change colorChanged
  $('#brushselector').change selectBrush
