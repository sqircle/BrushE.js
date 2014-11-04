color = require('onecolor')

constants  = require('./constants')
Mapping    = require('./Mapping')
math       = require('./math')
fmodf      = math.fmodf
clamp      = math.clamp
hypot      = math.hypot
hypotf     = math.hypotf
rand_gauss = math.rand_gauss
max3       = math.max3
min3       = math.min3

class Brush
  constructor: (brushsetting, @surface) ->
    @states                     = new Array(constants.STATE_COUNT)
    @settings                   = new Array(constants.BRUSH_SETTINGS_COUNT)
    @settings_value             = new Array(constants.BRUSH_SETTINGS_COUNT)
    @speed_mapping_gamma        = new Array(2)
    @speed_mapping_m            = new Array(2)
    @speed_mapping_q            = new Array(2)
    @stroke_current_idling_time = 0
    @stroke_total_painting_time = 0

    i = 0
    while i < constants.BRUSH_SETTINGS_COUNT
      @settings[i] = new Mapping(constants.INPUT_COUNT)
      i++

    @print_inputs = false

    i = 0
    while i < constants.STATE_COUNT
      @states[i] = 0
      i++

    @readmyb_json(brushsetting)

  readmyb_json: (settings) ->
    @setSettings(settings)

  setSettings: (settings) ->
    for setting of settings
      # FIXME: In the future users could distribute brushes and this would be vulnerable
      idx = eval("constants.BRUSH_" + setting.toUpperCase())

      return if idx >= constants.BRUSH_SETTINGS_COUNT #obsolute setting name , e.g ADAPT_COLOR_FROM_IMAGE

      m             = @settings[idx]
      m.base_value  = settings[setting].base_value
      m.inputs_used = 0

      for prop of settings[setting].pointsList
        # FIXME
        propidx = eval("constants.INPUT_" + prop.toUpperCase())
        m.pointsList[propidx].n = settings[setting].pointsList[prop].length / 2

        i = 0
        while i < m.pointsList[propidx].n
          m.pointsList[propidx].xvalues[i] = settings[setting].pointsList[prop][i * 2]
          m.pointsList[propidx].yvalues[i] = settings[setting].pointsList[prop][i * 2 + 1]
          i++

        m.inputs_used = 1

    @settings_base_values_have_changed()

  new_stroke: (x, y) ->
    i = 0

    while i < constants.STATE_COUNT
      @states[i] = 0
      @settings_value[i] = 0
      i++

    @states[constants.STATE_X] = x
    @states[constants.STATE_Y] = y
    @states[constants.STATE_STROKE] = 0
    @states[constants.STATE_STROKE_STARTED] = 0

    @stroke_current_idling_time = 0
    @stroke_total_painting_time = 0
    @surface.dab_count          = 0
    @surface.getcolor_count     = 0

    @stroke_to @surface, x, y, 0, 0, 0, 10

  set_base_value: (id, value) ->
    assert id >= 0 and id < constants.BRUSH_SETTINGS_COUNT, "id < BRUSH_SETTINGS_COUNT"
    @settings[id].base_value = value
    @settings_base_values_have_changed()

  set_mapping_n: (id, input, n) ->
    assert id >= 0 and id < constants.BRUSH_SETTINGS_COUNT, "id <BRUSH_SETTINGS_COUNT"
    @settings[id].set_n input, n

  set_mapping_point: (id, input, index, x, y) ->
    assert id >= 0 and id < constants.BRUSH_SETTINGS_COUNT, "id<BRUSH_SETTINGS_COUNT"
    @settings[id].set_point input, index, x, y

  exp_decay: (t_const, t) ->
    # the argument might not make mathematical sense (whatever.)
    if t_const <= 0.001
      0.0
    else
      Math.exp -t / t_const   

  settings_base_values_have_changed: ->
    i = 0
    while i < 2
      gamma = undefined

      if i is 0
        gamma = @settings[constants.BRUSH_SPEED1_GAMMA].base_value
      else
        gamma = @settings[constants.BRUSH_SPEED2_GAMMA].base_value

      gamma   = Math.exp(gamma)
      fix1_x  = 45.0
      fix1_y  = 0.5
      fix2_x  = 45.0
      fix2_dy = 0.015

      c1 = Math.log(fix1_x + gamma)
      m  = fix2_dy * (fix2_x + gamma)
      q  = fix1_y - m * c1

      @speed_mapping_gamma[i] = gamma
      @speed_mapping_m[i]     = m
      @speed_mapping_q[i]     = q
      i++

  update_states_and_setting_values: (step_dx, step_dy, step_dpressure, step_declination, step_ascension, step_dtime) ->
    pressure = undefined
    inputs   = new Array(constants.INPUT_COUNT)

    if step_dtime < 0.0
      step_dtime = 0.001
    else # FIXME
      step_dtime = 0.001 if step_dtime is 0.0

    @states[constants.STATE_X] += step_dx
    @states[constants.STATE_Y] += step_dy

    @states[constants.STATE_PRESSURE]    += step_dpressure
    @states[constants.STATE_DECLINATION] += step_declination
    @states[constants.STATE_ASCENSION]   += step_ascension

    base_radius = Math.exp(@settings[constants.BRUSH_RADIUS_LOGARITHMIC].base_value)
    
    # FIXME: does happen (interpolation problem?)
    @states[constants.STATE_PRESSURE] = clamp(@states[constants.STATE_PRESSURE], 0.0, 1.0)
    pressure = @states[constants.STATE_PRESSURE]
    
    # start / end stroke (for "stroke" input only)
    unless @states[constants.STATE_STROKE_STARTED]
      if pressure > @settings[constants.BRUSH_STROKE_TRESHOLD].base_value + 0.0001 
        # start new stroke
        @states[constants.STATE_STROKE_STARTED] = 1
        @states[constants.STATE_STROKE] = 0.0
    else   
      # end stroke 
      if pressure <= @settings[constants.BRUSH_STROKE_TRESHOLD].base_value * 0.9 + 0.0001
        @states[constants.STATE_STROKE_STARTED] = 0
  
    # now follows input handling
    norm_dx    = step_dx / step_dtime / base_radius
    norm_dy    = step_dy / step_dtime / base_radius
    norm_speed = Math.sqrt(norm_dx * norm_dx + norm_dy * norm_dy)
    norm_dist  = norm_speed * step_dtime

    inputs[constants.INPUT_PRESSURE]         = pressure
    inputs[constants.INPUT_SPEED1]           = Math.log(@speed_mapping_gamma[0] + @states[constants.STATE_NORM_SPEED1_SLOW]) * @speed_mapping_m[0] + @speed_mapping_q[0]
    inputs[constants.INPUT_SPEED2]           = Math.log(@speed_mapping_gamma[1] + @states[constants.STATE_NORM_SPEED2_SLOW]) * @speed_mapping_m[1] + @speed_mapping_q[1]
    inputs[constants.INPUT_RANDOM]           = Math.random()
    inputs[constants.INPUT_STROKE]           = Math.min(@states[constants.STATE_STROKE], 1.0)
    inputs[constants.INPUT_DIRECTION]        = math.fmodf(Math.atan2(@states[constants.STATE_DIRECTION_DY], @states[constants.STATE_DIRECTION_DX]) / (2 * Math.PI) * 360 + 180.0, 180.0)
    inputs[constants.INPUT_TILT_DECLINATION] = @states[constants.STATE_DECLINATION]
    inputs[constants.INPUT_TILT_ASCENSION]   = @states[constants.STATE_ASCENSION]
    inputs[constants.INPUT_CUSTOM]           = @states[constants.STATE_CUSTOM_INPUT]
  
    i = 0
    while i < constants.BRUSH_SETTINGS_COUNT
      aa = 0  if i is constants.BRUSH_ELLIPTICAL_DAB_RATIO
      @settings_value[i] = @settings[i].calculate(inputs)
      i++

    fac = 1.0 - @exp_decay(@settings_value[constants.BRUSH_SLOW_TRACKING_PER_DAB], 1.0)

    # FIXME: should this depend on base radius?
    @states[constants.STATE_ACTUAL_X] += (@states[constants.STATE_X] - @states[constants.STATE_ACTUAL_X]) * fac 
    @states[constants.STATE_ACTUAL_Y] += (@states[constants.STATE_Y] - @states[constants.STATE_ACTUAL_Y]) * fac

    # slow speed
    fac = 1.0 - @exp_decay(@settings_value[constants.BRUSH_SPEED1_SLOWNESS], step_dtime)
    @states[constants.STATE_NORM_SPEED1_SLOW] += (norm_speed - @states[constants.STATE_NORM_SPEED1_SLOW]) * fac

    fac = 1.0 - @exp_decay(@settings_value[constants.BRUSH_SPEED2_SLOWNESS], step_dtime)
    @states[constants.STATE_NORM_SPEED2_SLOW] += (norm_speed - @states[constants.STATE_NORM_SPEED2_SLOW]) * fac
    # slow speed, but as vector this time
    
    # FIXME: offset_by_speed should be removed.
    #   Is it broken, non-smooth, system-dependent math?!
    #   A replacement could be a directed random offset.
    time_constant = Math.exp(@settings_value[constants.BRUSH_OFFSET_BY_SPEED_SLOWNESS] * 0.01) - 1.0
    
    # Workaround for a bug that happens mainly on Windows, causing
    # individual dabs to be placed far far away. Using the speed
    # with zero filtering is just asking for trouble anyway.
    time_constant = 0.002 if time_constant < 0.002
    fac           = 1.0 - @exp_decay(time_constant, step_dtime)
    @states[constants.STATE_NORM_DX_SLOW] += (norm_dx - @states[constants.STATE_NORM_DX_SLOW]) * fac
    @states[constants.STATE_NORM_DY_SLOW] += (norm_dy - @states[constants.STATE_NORM_DY_SLOW]) * fac

    # orientation (similar lowpass filter as above, but use dabtime instead of wallclock time)
    dx = step_dx / base_radius
    dy = step_dy / base_radius

    step_in_dabtime = hypotf(dx, dy) # FIXME: are we recalculating something here that we already have?
    fac = 1.0 - @exp_decay(Math.exp(@settings_value[constants.BRUSH_DIRECTION_FILTER] * 0.5) - 1.0, step_in_dabtime)
    dx_old = @states[constants.STATE_DIRECTION_DX]
    dy_old = @states[constants.STATE_DIRECTION_DY]
    
    # use the opposite speed vector if it is closer (we don't care about 180 degree turns)
    if Math.sqrt(dx_old - dx) + Math.sqrt(dy_old - dy) > Math.sqrt(dx_old - (-dx)) + Math.sqrt(dy_old - (-dy))
      dx = -dx
      dy = -dy

    @states[constants.STATE_DIRECTION_DX] += (dx - @states[constants.STATE_DIRECTION_DX]) * fac
    @states[constants.STATE_DIRECTION_DY] += (dy - @states[constants.STATE_DIRECTION_DY]) * fac

    # custom input
    fac = 1.0 - @exp_decay(@settings_value[constants.BRUSH_CUSTOM_INPUT_SLOWNESS], 0.1)
    @states[constants.STATE_CUSTOM_INPUT] += (@settings_value[constants.BRUSH_CUSTOM_INPUT] - @states[constants.STATE_CUSTOM_INPUT]) * fac

    # stroke length
    frequency = Math.exp(-@settings_value[constants.BRUSH_STROKE_DURATION_LOGARITHMIC])
    @states[constants.STATE_STROKE] += norm_dist * frequency
    
    # can happen, probably caused by rounding
    @states[constants.STATE_STROKE] = 0 if @states[constants.STATE_STROKE] < 0
    wrap = 1.0 + @settings_value[constants.BRUSH_STROKE_HOLDTIME]

    if @states[constants.STATE_STROKE] > wrap
      if wrap > 9.9 + 1.0
        # "inifinity", just hold stroke somewhere >= 1.0
        @states[constants.STATE_STROKE] = 1.0
      else
        @states[constants.STATE_STROKE] = math.fmodf(@states[constants.STATE_STROKE], wrap)
        
        # just in case
        @states[constants.STATE_STROKE] = 0 if @states[constants.STATE_STROKE] < 0
    
    # calculate final radius
    radius_log = @settings_value[constants.BRUSH_RADIUS_LOGARITHMIC]
    @states[constants.STATE_ACTUAL_RADIUS] = Math.exp(radius_log)
    @states[constants.STATE_ACTUAL_RADIUS] = constants.ACTUAL_RADIUS_MIN if @states[constants.STATE_ACTUAL_RADIUS] < constants.ACTUAL_RADIUS_MIN
    @states[constants.STATE_ACTUAL_RADIUS] = constants.ACTUAL_RADIUS_MAX if @states[constants.STATE_ACTUAL_RADIUS] > constants.ACTUAL_RADIUS_MAX
    
    # aspect ratio (needs to be caluclated here because it can affect the dab spacing)
    @states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_RATIO] = @settings_value[constants.BRUSH_ELLIPTICAL_DAB_RATIO]
    @states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_ANGLE] = @settings_value[constants.BRUSH_ELLIPTICAL_DAB_ANGLE]

  prepare_and_draw_dab: (surface) ->    
    # ensure we don't get a positive result with two negative opaque values
    settings_value[constants.BRUSH_OPAQUE] = 0 if @settings_value[constants.BRUSH_OPAQUE] < 0

    opaque = @settings_value[constants.BRUSH_OPAQUE] * @settings_value[constants.BRUSH_OPAQUE_MULTIPLY]
    opaque = math.clamp(opaque, 0.0, 1.0)
    
    if @settings_value[constants.BRUSH_OPAQUE_LINEARIZE]     
      # OPTIMIZE: no need to recalculate this for each dab

      # dabs_per_pixel is just estimated roughly, I didn't think hard
      # about the case when the radius changes during the stroke
      dabs_per_pixel = (@settings[constants.BRUSH_DABS_PER_ACTUAL_RADIUS].base_value + @settings[constants.BRUSH_DABS_PER_BASIC_RADIUS].base_value) * 2.0
      
      # the correction is probably not wanted if the dabs don't overlap
      dabs_per_pixel = 1.0 if dabs_per_pixel < 1.0
      
      # interpret the user-setting smoothly
      dabs_per_pixel = 1.0 + @settings[constants.BRUSH_OPAQUE_LINEARIZE].base_value * (dabs_per_pixel - 1.0)
      
      alpha     = opaque
      beta      = 1.0 - alpha
      beta_dab  = Math.pow(beta, 1.0 / dabs_per_pixel)
      alpha_dab = 1.0 - beta_dab
      opaque    = alpha_dab

    x = @states[constants.STATE_ACTUAL_X]
    y = @states[constants.STATE_ACTUAL_Y]
    base_radius = Math.exp(@settings[constants.BRUSH_RADIUS_LOGARITHMIC].base_value)

    if @settings_value[constants.BRUSH_OFFSET_BY_SPEED]
      x += @states[constants.STATE_NORM_DX_SLOW] * @settings_value[constants.BRUSH_OFFSET_BY_SPEED] * 0.1 * base_radius
      y += @states[constants.STATE_NORM_DY_SLOW] * @settings_value[constants.BRUSH_OFFSET_BY_SPEED] * 0.1 * base_radius

    if @settings_value[constants.BRUSH_OFFSET_BY_RANDOM]
      amp = @settings_value[constants.BRUSH_OFFSET_BY_RANDOM]
      amp = 0.0  if amp < 0.0
      x += rand_gauss() * amp * base_radius
      y += rand_gauss() * amp * base_radius

    radius = @states[constants.STATE_ACTUAL_RADIUS]
    if @settings_value[constants.BRUSH_RADIUS_BY_RANDOM]
      # go back to logarithmic radius to add the noise
      radius_log  = @settings_value[constants.BRUSH_RADIUS_LOGARITHMIC]
      radius_log += rand_gauss() * @settings_value[constants.BRUSH_RADIUS_BY_RANDOM]

      radius = Math.exp(radius_log)
      radius = clamp(radius, constants.ACTUAL_RADIUS_MIN, constants.ACTUAL_RADIUS_MAX)

      alpha_correction = @states[constants.STATE_ACTUAL_RADIUS] / radius
      alpha_correction = Math.sqrt(alpha_correction)
      
      opaque *= alpha_correction if alpha_correction <= 1.0
    
    # color part
    colorhsv = new color.HSV(@settings[constants.BRUSH_COLOR_HUE].base_value, 
                                 @settings[constants.BRUSH_COLOR_SATURATION].base_value, 
                                 @settings[constants.BRUSH_COLOR_VALUE].base_value)
    
    color_h = colorhsv.hue()
    color_s = colorhsv.saturation()
    color_v = colorhsv.value()
    eraser_target_alpha = 1.0

    if @settings_value[constants.BRUSH_SMUDGE] > 0.0
      # mix (in RGB) the smudge color with the brush color
      # TODO fix confusing use of rgb as h,s,v vars
      color_h = colorhsv.red() #after conversion, color_h,s,v is rgb
      color_s = colorhsv.green()
      color_v = colorhsv.blue()

      fac = @settings_value[constants.BRUSH_SMUDGE]
      fac = 1.0  if fac > 1.0
      
      # If the smudge color somewhat transparent, then the resulting
      # dab will do erasing towards that transparency level.
      # see also ../doc/smudge_math.png
      eraser_target_alpha = (1 - fac) * 1.0 + fac * @states[constants.STATE_SMUDGE_A]
      
      # fix rounding errors (they really seem to happen in the previous line)
      eraser_target_alpha = clamp(eraser_target_alpha, 0.0, 1.0)
      if eraser_target_alpha > 0
        color_h = (fac * @states[constants.STATE_SMUDGE_RA] + (1 - fac) * color_h) / eraser_target_alpha
        color_s = (fac * @states[constants.STATE_SMUDGE_GA] + (1 - fac) * color_s) / eraser_target_alpha
        color_v = (fac * @states[constants.STATE_SMUDGE_BA] + (1 - fac) * color_v) / eraser_target_alpha
      else
        # we are only erasing; the color does not matter
        color_h = 1.0
        color_s = 0.0
        color_v = 0.0
      
      colorrgb = new color.RGB(color_h, color_s, color_v)

      color_h = colorhsv.hue()
      color_s = colorhsv.saturation()
      color_v = colorhsv.value()
    
    # optimization, since normal brushes have smudge_length == 0.5 without actually smudging
    if @settings_value[constants.BRUSH_SMUDGE_LENGTH] < 1.0 and (@settings_value[constants.BRUSH_SMUDGE] isnt 0.0 or not @settings[constants.BRUSH_SMUDGE].is_constant())
      smudge_radius = radius * Math.exp(@settings_value[constants.BRUSH_SMUDGE_RADIUS_LOG])
      smudge_radius = clamp(smudge_radius, constants.ACTUAL_RADIUS_MIN, constants.ACTUAL_RADIUS_MAX)

      fac = @settings_value[constants.BRUSH_SMUDGE_LENGTH]
      fac = 0 if fac < 0.0

      px = Math.round(x)
      py = Math.round(y)

      surface.get_color px, py, smudge_radius
      r = surface.r
      g = surface.g
      b = surface.b
      a = surface.a
      
      # updated the smudge color (stored with premultiplied alpha)
      @states[constants.STATE_SMUDGE_A] = fac * @states[constants.STATE_SMUDGE_A] + (1 - fac) * a
      
      # fix rounding errors
      @states[constants.STATE_SMUDGE_A]  = clamp(@states[constants.STATE_SMUDGE_A], 0.0, 1.0)
      @states[constants.STATE_SMUDGE_RA] = fac * @states[constants.STATE_SMUDGE_RA] + (1 - fac) * r * a
      @states[constants.STATE_SMUDGE_GA] = fac * @states[constants.STATE_SMUDGE_GA] + (1 - fac) * g * a
      @states[constants.STATE_SMUDGE_BA] = fac * @states[constants.STATE_SMUDGE_BA] + (1 - fac) * b * a
    
    # eraser
    eraser_target_alpha *= (1.0 - @settings_value[constants.BRUSH_ERASER]) if @settings_value[constants.BRUSH_ERASER]
    
    # HSV color change
    color_h += @settings_value[constants.BRUSH_CHANGE_COLOR_H]
    color_s += @settings_value[constants.BRUSH_CHANGE_COLOR_HSV_S]
    color_v += @settings_value[constants.BRUSH_CHANGE_COLOR_V]
    
    # HSL color change
    # TODO simplify this
    if @settings_value[constants.BRUSH_CHANGE_COLOR_L] or @settings_value[constants.BRUSH_CHANGE_COLOR_HSL_S]
      # (calculating way too much here, can be optimized if neccessary)
      # this function will CLAMP the inputs
      colorhsv = new color.HSV(color_h, color_s, color_v)

      colorrgb = new color.RGB(colorhsv.red(), colorhsv.green(), colorhsv.blue())

      colorrgb.lightness(colorrgb.lightness() + @settings_value[constants.BRUSH_CHANGE_COLOR_L])
      colorrgb.saturation(colorrgb.saturation() + @settings_value[constants.BRUSH_CHANGE_COLOR_HSL_S])

      colorhsl = new color.HSL(colorrgb.hue(), colorrgb.saturation(), colorrgb.lightness())

      colorrgb = new color.RGB(colorhsl.red(), colorhsl.green(), colorhsl.blue())

      color_h = colorrgb.hue()
      color_s = colorrgb.saturation()
      color_v = colorrgb.value()

    hardness = @settings_value[constants.BRUSH_HARDNESS]
    
    # the functions below will CLAMP most inputs
    colorhsv = new color.HSV(color_h, color_s, color_v)
    surface.draw_dab(x, y, radius, 
                  colorhsv.red(), colorhsv.green(), colorhsv.blue(), 
                  opaque, hardness, 
                  eraser_target_alpha, 
                  @states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_RATIO], 
                  @states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_ANGLE])

  # How many dabs will be drawn between the current and the next (x, y, pressure, +dt) position?
  count_dabs_to: (x, y, pressure, dt) ->
    dist = undefined
    @states[constants.STATE_ACTUAL_RADIUS] = Math.exp(@settings[constants.BRUSH_RADIUS_LOGARITHMIC].base_value) if @states[constants.STATE_ACTUAL_RADIUS] is 0.0
    @states[constants.STATE_ACTUAL_RADIUS] = constants.ACTUAL_RADIUS_MIN if @states[constants.STATE_ACTUAL_RADIUS] < constants.ACTUAL_RADIUS_MIN
    @states[constants.STATE_ACTUAL_RADIUS] = constants.ACTUAL_RADIUS_MAX if @states[constants.STATE_ACTUAL_RADIUS] > constants.ACTUAL_RADIUS_MAX
    
    # OPTIMIZE: expf() called too often
    base_radius = Math.exp(@settings[constants.BRUSH_RADIUS_LOGARITHMIC].base_value)
    base_radius = constants.ACTUAL_RADIUS_MIN if base_radius < constants.ACTUAL_RADIUS_MIN
    base_radius = constants.ACTUAL_RADIUS_MAX if base_radius > constants.ACTUAL_RADIUS_MAX
    
    xx = x - @states[constants.STATE_X]
    yy = y - @states[constants.STATE_Y]
    
    # TODO: control rate with pressure (dabs per pressure) (dpressure is useless)
    if @states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_RATIO] > 1.0
      angle_rad = @states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_ANGLE] / 360 * 2 * Math.PI
      cs   = Math.cos(angle_rad)
      sn   = Math.sin(angle_rad)
      yyr  = (yy * cs - xx * sn) * @states[constants.STATE_ACTUAL_ELLIPTICAL_DAB_RATIO]
      xxr  = yy * sn + xx * cs
      dist = Math.sqrt(yyr * yyr + xxr * xxr)
    else
      dist = hypotf(xx, yy)
    
    # FIXME: no need for base_value or for the range checks above IF always the interpolation
    #        function will be called before this one
    res1 = dist / @states[constants.STATE_ACTUAL_RADIUS] * @settings[constants.BRUSH_DABS_PER_ACTUAL_RADIUS].base_value
    res2 = dist / base_radius * @settings[constants.BRUSH_DABS_PER_BASIC_RADIUS].base_value
    res3 = dt * @settings[constants.BRUSH_DABS_PER_SECOND].base_value
    res1 + res2 + res3

  stroke_to: (surface, x, y, pressure, xtilt, ytilt, dtime) ->
    tilt_ascension   = 0.0
    tilt_declination = 90.0

    if xtilt isnt 0 or ytilt isnt 0  
      # shield us from insane tilt input
      xtilt = clamp(xtilt, -1.0, 1.0)
      ytilt = clamp(ytilt, -1.0, 1.0)
      
      #assert(isfinite(xtilt) && isfinite(ytilt));
      tilt_ascension = 180.0 * Math.atan2(-xtilt, ytilt) / Math.PI
      e = undefined

      if Math.abs(xtilt) > Math.abs(ytilt)
        e = Math.sqrt(1 + ytilt * ytilt)
      else
        e = Math.sqrt(1 + xtilt * xtilt)

      rad = hypot(xtilt, ytilt)

      cos_alpha = rad / e
      cos_alpha = 1.0 if cos_alpha >= 1.0 # fixes numerical inaccuracy

      tilt_declination = 180.0 * Math.acos(cos_alpha) / Math.PI
    
    pressure = clamp(pressure, 0.0, 1.0)
    
    dtime = 0.0001 if dtime <= 0 # protect against possible division by zero bugs

    if dtime > 0.100 and pressure and @states[constants.STATE_PRESSURE] is 0
      # Workaround for tablets that don't report motion events without pressure.
      # This is to avoid linear interpolation of the pressure between two events.
      @stroke_to surface, x, y, 0.0, 90.0, 0.0, dtime - 0.0001
      dtime = 0.0001

    # noise first
    if @settings[constants.BRUSH_TRACKING_NOISE].base_value
      # OPTIMIZE: expf() called too often
      base_radius = Math.exp(@settings[constants.BRUSH_RADIUS_LOGARITHMIC].base_value)
     
      x += rand_gauss() * @settings[constants.BRUSH_TRACKING_NOISE].base_value * base_radius
      y += rand_gauss() * @settings[constants.BRUSH_TRACKING_NOISE].base_value * base_radius

    fac = 1.0 - @exp_decay(@settings[constants.BRUSH_SLOW_TRACKING].base_value, 100.0 * dtime)
    x = @states[constants.STATE_X] + (x - @states[constants.STATE_X]) * fac
    y = @states[constants.STATE_Y] + (y - @states[constants.STATE_Y]) * fac
    
    # draw many (or zero) dabs to the next position
    dist_moved = @states[constants.STATE_DIST]
    dist_todo  = @count_dabs_to(x, y, pressure, dtime)
    
    if dtime > 5
      # FIXME
      # Brush Reset Handling
      i = 0

      while i < constants.STATE_COUNT
        @states[i] = 0
        i++

      @states[constants.STATE_X] = x
      @states[constants.STATE_Y] = y
      @states[constants.STATE_PRESSURE] = pressure
      
      # not resetting, because they will get overwritten below:
      @states[constants.STATE_ACTUAL_X] = @states[constants.STATE_X]
      @states[constants.STATE_ACTUAL_Y] = @states[constants.STATE_Y]
      @states[constants.STATE_STROKE] = 1.0 # start in a state as if the stroke was long finished
    
    UNKNOWN    = 0
    YES        = 1
    NO         = 2
    painted    = UNKNOWN

    dtime_left = dtime

    step_dx          = undefined
    step_dy          = undefined
    step_dpressure   = undefined
    step_dtime       = undefined
    step_declination = undefined
    step_ascension   = undefined

    while dist_moved + dist_todo >= 1.0 # there are dabs pending
      # linear interpolation (nonlinear variant was too slow, see SVN log)
      frac = undefined # fraction of the remaining distance to move
      if dist_moved > 0  
        # "move" the brush exactly to the first dab (moving less than one dab)
        frac = (1.0 - dist_moved) / dist_todo
        dist_moved = 0
      else
        # "move" the brush from one dab to the next
        frac = 1.0 / dist_todo

      step_dx = frac * (x - @states[constants.STATE_X])
      step_dy = frac * (y - @states[constants.STATE_Y])

      step_dpressure = frac * (pressure - @states[constants.STATE_PRESSURE])
      step_dtime     = frac * (dtime_left - 0.0)

      step_declination = frac * (tilt_declination - @states[constants.STATE_DECLINATION])
      step_ascension   = frac * (tilt_ascension   - @states[constants.STATE_ASCENSION])
      
      # Though it looks different, time is interpolated exactly like x/y/pressure.
      @update_states_and_setting_values step_dx, step_dy, step_dpressure, step_declination, step_ascension, step_dtime
     
      painted_now = @prepare_and_draw_dab(surface)

      if painted_now
        painted = YES
      else 
        painted = NO if painted is UNKNOWN

      dtime_left -= step_dtime
      dist_todo   = @count_dabs_to(x, y, pressure, dtime_left)
    
    # "move" the brush to the current time (no more dab will happen)
    # Important to do this at least once every event, because
    # brush_count_dabs_to depends on the radius and the radius can
    # depend on something that changes much faster than only every
    # dab (eg speed).
    step_dx          = x - @states[constants.STATE_X]
    step_dy          = y - @states[constants.STATE_Y]
    step_dpressure   = pressure         - @states[constants.STATE_PRESSURE]
    step_declination = tilt_declination - @states[constants.STATE_DECLINATION]
    step_ascension   = tilt_ascension   - @states[constants.STATE_ASCENSION]
    step_dtime       = dtime_left
    
    #dtime_left = 0; but that value is not used any more
    @update_states_and_setting_values step_dx, step_dy, step_dpressure, step_declination, step_ascension, step_dtime
    
    # save the fraction of a dab that is already done now
    @states[constants.STATE_DIST] = dist_moved + dist_todo
    
    # stroke separation logic (for undo/redo)
    if painted is UNKNOWN
      if @stroke_current_idling_time > 0 or @stroke_total_painting_time is 0
        painted = NO
      else
        # probably still painting (we get more events than brushdabs)
        painted = YES
    
    if painted is YES
      @stroke_total_painting_time += dtime
      @stroke_current_idling_time  = 0
      
      # force a stroke split after some time
      
      # but only if pressure is not being released
      # FIXME: use some smoothed state for dpressure, not the output of the interpolation code
      #        (which might easily wrongly give dpressure == 0)
      return true if step_dpressure >= 0 if @stroke_total_painting_time > 4 + 3 * pressure
    else if painted is NO
      @stroke_current_idling_time += dtime
      if @stroke_total_painting_time is 0
        # not yet painted, start a new stroke if we have accumulated a lot of irrelevant motion events
        return true if @stroke_current_idling_time > 1.0
      else
        
        # Usually we have pressure==0 here. But some brushes can paint
        # nothing at full pressure (eg gappy lines, or a stroke that
        # fades out). In either case this is the prefered moment to split.
        return true if @stroke_total_painting_time + @stroke_current_idling_time > 1.2 + 5 * pressure

    false

module.exports = Brush
