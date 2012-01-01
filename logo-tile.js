/*
Copyright (c) 2011, Xin Wang
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

    Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
    Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

"use strict"

globals.colors = {
    apply: '#BED600',
    number: 'white',
    argument: 'white',
    control: '#808CD6',
    list: '#D9F1FB',
    infix: '#FFB612',
    to: '#DDDDDD',
    to_name: 'white',
    to_variable: 'white',
    to_delete: 'white',
    button: '#FF6E00',
}

traits.Source = Self.trait([], {
    expressions: null,

    auto_save_list: [],

    auto_save: function (src) {
	this.auto_save_list.push(src)

	if (this.auto_save_list.length > 1000)
	    this.auto_save_list.splice(0, 1)
    },

    restore: function () {
	if (this.auto_save_list.length <= 0) {
	    return false
	} else {
	    var src = this.auto_save_list.pop()
	    this.import(src)
	    return true
	}
    },

    export: function () {
	var src = ""

	this.expressions.forEach(function (expr) {
	    src += globals.lang.export_expr(expr) + "\n"
	})

	return src
    },

    import: function (src) {
        var tokens = globals.lang.tokenize(src)
        this.expressions = globals.lang.parse(tokens)
    },

    remove_expression: function (expr) {
        var index = this.expressions.indexOf(expr)

        if (index != -1) {
            this.expressions.splice(index, 1)
	    return
	}

	var parent = expr.parent

	if (parent && parent.delete_child) {
	    this.auto_save(this.export())
            return parent.delete_child(expr)
	} else if (parent && parent.replace_child) {
	    this.auto_save(this.export())
	    return parent.replace_child(expr, prototypes.nil.clone())
	} else {
	    return false
	}
    },

    replace_expression: function (old, nu) {
	/* parent and child can not be displaced */
	if (old.parent === nu || nu.parent === old)
	    return false

	/*
	  Do not replace by a list or word definition, so that drag a
	  tile to a list will only move it to the list, and drag a
	  tile to a word definition will no nothing.
	*/
	if (nu.type === 'LIST' || nu.type === 'TO')
	    return globals.source.remove_expression(old)

	var parent = old.parent

	if (parent && parent.replace_child) {
	    this.auto_save(this.export())
	    return parent.replace_child(old, nu)
	} else {
	    return false
	}
    },

    run: function () {
        globals.lang.run_expr(this.expressions, globals.logger)
    },

    forEach: function (fn) {
	this.expressions.forEach(fn)
    },
})

globals.source = Self.prototype(traits.Source, { })

/**
   Extend paper.PointText to add bounds support. Here we use a <span>
   to calculate text width and height.
*/
globals.Text = paper.PointText.extend({
    initialize: function (content, color) {
        color = color || '#333333'

        this.base()
        this.content = content
	this.characterStyle = {
	    font: 'Microsoft YaHei',
	    fontSize: 12,
	    fillColor: color
	}
    },

    _getBounds: function (getter, cacheName, args) {
	if (!globals.text_width_calculator) {
	    document.body.appendChild(document.createElement("br"))
	    var span = document.createElement("span")
	    span.style.font = "12pt Microsoft YaHei"
	    span.style.visibility = "hidden"
	    span.style.position = "absolute"
	    span.style.padding = "0"
	    span.style.width = "auto"
	    document.body.appendChild(span)
	    globals.text_width_calculator = span
	} else {
	    var span = globals.text_width_calculator
	}

        span.innerHTML = this.content

        var w = span.offsetWidth
        var h = span.offsetHeight

        var p = this.point
        var bounds = paper.Rectangle.create(p.x, p.y - h * 0.75, w, h)

        return getter == 'getBounds' ? this._createBounds(bounds) : bounds
    },

    set_position: function (pos) {
        this.position = pos.add([0, this.bounds.height * 0.75])
    },
})

/**
   Override paper.Group's hitTest function to only test hits for child
   HitGroup items.

   And this beheavior will be overrided by Tile.
*/
globals.HitGroup = paper.Group.extend({
    hitTest: function (point, options, matrix) {
        options = HitResult.getOptions(point, options)
        point = options.point

        if (this._children) {
            for (var i = this._children.length - 1; i >= 0; i--) {
                if (this._children[i] instanceof globals.HitGroup) {
                    var res = this._children[i].hitTest(point, options, matrix)
                    if (res) return res
                }
            }
        }

        return null
    },

    set_position: function (pos) {
        this.position = pos.add(this.bounds.size.divide(2))
    },

})

/**
   Tile base object, extended from HitGroup, so all tiles are groups.

   Every tile has an `expr' attribute to hold log expression relate to
   this tile.
*/
globals.Tile = globals.HitGroup.extend({
    initialize: function (expr) {
        this.base()
        this.expr = expr
    },

    SPACING: 3,

    /**
       label -- translate tile label
    */
    label: function (text) {
	if (globals.tile_labels && globals.tile_labels[text])
	    return globals.tile_labels[text]
	else
	    return text
    },

    /**
       hitTest -- hitTest function for Tile

       Test hit for children firstly, and then self.
    */
    hitTest: function (point, options, matrix) {
        options = HitResult.getOptions(point, options)
        point = options.point

	/* test for children */
	var children = this._children
	var result = null
        if (children) {
            for (var i = children.length - 1; i >= 0; i--) {
                if (children[i] instanceof globals.HitGroup
		    && (result = children[i].hitTest(point, options, matrix)))
		    break
            }
        }
	if (result)
	    return result

	/* test for self */
        var bounds = this.getBounds()

        var top_left = bounds.getTopLeft().transform(matrix)
        var bottom_right = bounds.getBottomRight().transform(matrix)

        if (point.x >= top_left.x
            && point.x <= bottom_right.x
            && point.y >= top_left.y
            && point.y <= bottom_right.y) {
            return new HitResult('center', this,
                                 { name: paper.Base.hyphenate('Center'),
                                   point: point })
        } else {
            return null
        }
    },

    /**
       add_child -- add a child tile
    */
    add_child: function (item) {
	return this.addChild(item)
    },

    /**
       set_background -- set background of a tile

       Insert a rectangle at the bottom of the tile to treat as a
       background.

       @color: color of the background
       @border: border size (both horizontal and vectical)
       @vect_border: vectical border size
    */
    set_background: function (color, border, vect_border) {
	var hb = typeof border === 'undefined' ? 0 : border
	var vb = typeof vect_border === 'undefined' ? hb : vect_border

        var point = new paper.Point(hb, vb)
        var size = new paper.Size(hb * 2, vb * 2)

        var bounds = this.bounds

        var rect = new paper.Path.Rectangle(
            bounds.point.subtract(point), bounds.size.add(size))

        var c1 = new paper.Color(color)
        var c2 = c1.clone()
        c2.lightness = c1.lightness * 1.25
        var gradient = new paper.Gradient([c2, c1], 'radial')

        rect.fillColor = new paper.GradientColor(gradient,
                                                 rect.bounds.topLeft,
                                                 rect.bounds.bottomRight)

        this.insertChild(0, rect)
    },

    /**
       replace_self -- try to replace self with a new tile

       Delete self if `tile' is null
    */
    replace_self: function (tile) {
	if (!tile || !tile.expr)
	    return globals.source.remove_expression(this.expr)
	else
	    return globals.source.replace_expression(this.expr, tile.expr)
    }
})

/**
   traits.Expr.tile -- create a tile of an expression

   Tile is hightlighted if it is the current running expression.
*/
Self.add_slot(traits.Expr, "tile", function () {
    var TileType = {
        'APPLY': globals.ApplyTile,
        'TO': globals.ToTile,
        'LIST': globals.ListTile,
        'NUMBER': globals.NumberTile,
        'NIL': globals.NilTile,
        'PAREN': globals.ParenTile,
        'VARIABLE': globals.VariableTile,
        'INFIX': globals.InfixTile
    }[this.type]

    var tile = new TileType(this)

    if (this === globals.current_expression) {
        var bounds = tile.bounds

        var border = new paper.Path.Rectangle(bounds.point, bounds.size)
        border.strokeColor = '#F37C78'
        border.strokeWidth = 3

        tile.add_child(border)
    }

    return tile
})

globals.NewToTile = globals.Tile.extend({
    initialize: function () {
        this.base()
        var name = new globals.Text(this.label('TO'), '#FFFFF')
        this.add_child(name)
        this.set_background(globals.colors.button, 5)
    },

    create_description_dialog: function () {
	var form, input

	form = document.createElement('form')
	form.id = "input-word-desc-dialog"
	form.visibility = "hidden"
	form.style.margin = "auto"
	form.style.left = "0"
	form.style.right = "0"
	form.style.top = "0"
	form.style.bottom = "0"
	form.style.position = "absolute"
	form.style.width = "200px"
	form.style.height = "80px"
	form.style.color = "#333333"
	form.style.border = "#F7F9FE 5px solid"
	form.style.background = "#DCE8EB"
	form.style.padding = "10px"
	form.style.textAlign = "center"

	input = document.createElement('input')
	input.name = "desciption"
	input.style.margin = "10px"
	input.style.width = "180px"
	form.appendChild(input)

	input = document.createElement('input')
	input.type = "submit"
	input.value = this.label('OK')
	input.style.color = "#333333"
	input.style.margin = "10px"
	input.style.border = "#F7F9FE 0px solid"
	form.appendChild(input)

	input = document.createElement('input')
	input.type = "button"
	input.value = this.label('Cancel')
	input.style.color = "#333333"
	input.style.margin = "10px"
	input.style.border = "#F7F9FE 0px solid"
	input.onclick = function () {
	     this.parentNode.style.visibility = 'hidden'
	}
	form.appendChild(input)

	document.body.appendChild(form)
	return form
    },

    click_cb: function () {
        var form

	if (!(form = document.getElementById('input-word-desc-dialog')))
	    form = this.create_description_dialog()

        var input = form.elements['desciption']

        input.value = this.label("name arg1 arg2")
        form.style.visibility = 'visible'

        form.onsubmit = function () {
            var content = input.value

            if (!content)
                return false

            var items = content.split(/\s+/)
            if (items.length < 1)
                return false

            var expr = prototypes.expr_to.clone(items[0])
            expr.arg_names = items.slice(1).map(function (arg) {
                return ':' + arg
            })

            var exprs = globals.source.expressions

            var i = 0
            for (; i < exprs.length; ++i) {
                if (exprs[i].type != 'TO'
                    || exprs[i].name == globals.main_word_name)
                    break
            }
            exprs.splice(i, 0, expr)

            form.style.visibility = 'hidden'
            document.activeElement.blur()
            globals.source_canvas.redraw()
            paper.view.draw()

            return false
        }

        input.focus()
        input.select()
    }
})

globals.ProtoTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)
        var color = globals.colors.apply

        var label = null
        switch (expr.type) {
        case 'APPLY':
            label = expr.name
            if (expr.name == 'repeat' || expr.name == 'ifelse')
                color = globals.colors.control
            break
        case 'LIST':
            label = this.label('list')
            color = globals.colors.list
            break
        case 'NUMBER':
            label = this.label('number')
            break
        case 'INFIX':
            label = this.label(expr.op)
            color = globals.colors.infix
            break
        case 'TO':
            label = this.label('TO')
            break
        }

        var name = new globals.Text(label)

        this.add_child(name)

        this.set_background(color, 5)
    },

    clone: function () {
	var tile = new globals.ProtoTile(this.expr)
	tile.position = this.position
	return tile
    },

    on_drag_end: function (overlap) {
    },
})

globals.UserWordTile = globals.ProtoTile.extend({
    click_cb: function () {
        if (this.expr.type == 'APPLY') {
            var  words = globals.user_defined_words

            for (var i = 0; i < words.length; ++i) {
                var to_expr = words[i]

                if (to_expr.name == this.expr.name)
                    to_expr.hide = !to_expr.hide
            }
        }
    }
})

globals.RunTile = globals.Tile.extend({
    initialize: function () {
        this.base()

        var label = new globals.Text(this.label('start'), '#FFFFFF')

        this.add_child(label)

        this.set_background(globals.colors.button, 5)
    },

    click_cb: function (expr) {
        var layer = globals.drawing_layer
        layer.removeChildren()
        layer.activate()

        globals.init_drawing_area()
        globals.running = true
	globals.source.run()
        paper.project.layers[0].activate()
    },
})

globals.StopTile = globals.Tile.extend({
    initialize: function () {
        this.base()

        var label = new globals.Text(this.label('stop'), '#FFFFFF')

        this.add_child(label)

        this.set_background(globals.colors.button, 5)
    },

    click_cb: function (expr) {
        var layer = globals.drawing_layer
        layer.removeChildren()
        layer.activate()

        globals.running = false
        globals.init_drawing_area()
        paper.project.layers[0].activate()
    },
})

globals.PauseTile = globals.Tile.extend({
    initialize: function () {
        this.base()

        var label = new globals.Text(this.label('pause'), '#FFFFFF')

        this.add_child(label)

        this.set_background(globals.colors.button, 5)
    },

    click_cb: function (expr) {
        globals.paused = !globals.paused
    },
})

globals.ContinueTile = globals.Tile.extend({
    initialize: function () {
        this.base()

        var label = new globals.Text(this.label('continue'), '#FFFFFF')

        this.add_child(label)

        this.set_background('#F37C78', 5)
    },

    click_cb: function (expr) {
        globals.paused = !globals.paused
    },
})

globals.StepTile = globals.Tile.extend({
    initialize: function () {
        this.base()

        var label = new globals.Text(this.label('step'), '#FFFFFF')

        this.add_child(label)

        this.set_background(globals.colors.button, 5)
    },

    click_cb: function (expr) {
        var layer = globals.drawing_layer
        if (globals.running) {
            layer.activate()

            globals.lang.step()
        } else {
            layer.removeChildren()
            layer.activate()

            globals.init_drawing_area()
            globals.running = true
            globals.paused = true
	    globals.source.run()
        }

        paper.project.layers[0].activate()
    },
})

globals.ViewSourceTile = globals.Tile.extend({
    initialize: function () {
        this.base()

        var label = new globals.Text(this.label('source'), '#FFFFFF')

        this.add_child(label)

        this.set_background(globals.colors.button, 5)
    },

    create_source_textarea: function () {
	var text, div

	div = document.createElement('div')
	div.id = "source"
	div.visibility = "hidden"
	div.style.margin = "auto"
	div.style.background = "#DCE8EB"
	div.style.left = "0"
	div.style.right = "0"
	div.style.top = "0"
	div.style.bottom = "0"
	div.style.position = "absolute"
	div.style.width = "400px"
	div.style.height = "350px"
	div.style.textAlign = "center"

	text = document.createElement('textarea')
	text.style.color = "#333333"
	text.style.font = "11pt Consolas"
	text.style.border = "#DCE8EB 5px solid"
	text.style.background = "#F7F9FE"
	text.style.overflow = "auto"
	text.style.padding = "10px"
	text.style.width = "400px"
	text.style.height = "300px"
	text.style.boxSizing = "border-box"
	div.appendChild(text)

	div.appendChild(document.createElement('br'))

	var save = document.createElement('button')
	save.innerHTML = this.label('Save')
	save.style.color = "#333333"
	save.style.margin = "10px"
	save.style.border = "#F7F9FE 0px solid"
	save.onclick = function () {
	    var src = this.parentNode.firstChild.value
	    globals.source.import(src)
	    this.parentNode.style.visibility = 'hidden'
            globals.source_canvas.redraw()
            paper.view.draw()
	}
	div.appendChild(save)

	var cancel = document.createElement('button')
	cancel.innerHTML = this.label('Cancel')
	cancel.style.color = "#333333"
	cancel.style.margin = "10px"
	cancel.style.border = "#F7F9FE 0px solid"
	cancel.onclick = function () {
	    this.parentNode.style.visibility = 'hidden'
	}
	div.appendChild(cancel)

	document.body.appendChild(div)

	return div
    },

    click_cb: function (expr) {
        var source

	if (!(source = document.getElementById('source')))
	    source = this.create_source_textarea()

	source.firstChild.value = globals.source.export()
        source.style.visibility = 'visible'
    },
})

globals.SpeedTile = globals.Tile.extend({
    initialize: function () {
        this.base()

        var x = 0

        var num = globals.steps.tile()
        num.translate(x, 0)
        x += num.bounds.width + 5
        this.add_child(num)

        var label = new globals.Text(this.label('step(s) per second'))
        label.translate(x, 0)
        this.add_child(label)

        this.set_background('#CBDBE0', 5)
    },
})

globals.NumberTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)
        this.add_child(new globals.Text(expr.value.toString()))
        this.set_background(globals.colors.number, this.SPACING)
    },

    on_drop: function (tile) {
        return this.replace_self(tile)
    },

    on_drag_end: function (overlap) {
	return this.replace_self(overlap)
    },

    create_input_dialog: function () {
	var form, input

	form = document.createElement('form')
	form.id = "input-num-dialog"
	form.visibility = "hidden"
	form.style.margin = "auto"
	form.style.left = "0"
	form.style.right = "0"
	form.style.top = "0"
	form.style.bottom = "0"
	form.style.position = "absolute"
	form.style.width = "200px"
	form.style.height = "80px"
	form.style.color = "#333333"
	form.style.border = "#F7F9FE 5px solid"
	form.style.background = "#DCE8EB"
	form.style.padding = "10px"
	form.style.textAlign = "center"

	input = document.createElement('input')
	input.name = "value"
	input.style.margin = "10px"
	input.style.width = "180px"
	form.appendChild(input)

	input = document.createElement('input')
	input.type = "submit"
	input.value = this.label('OK')
	input.style.color = "#333333"
	input.style.margin = "10px"
	input.style.border = "#F7F9FE 0px solid"
	form.appendChild(input)

	input = document.createElement('input')
	input.type = "button"
	input.value = this.label('Cancel')
	input.style.color = "#333333"
	input.style.margin = "10px"
	input.style.border = "#F7F9FE 0px solid"
	input.onclick = function () {
	     this.parentNode.style.visibility = 'hidden'
	}
	form.appendChild(input)

	document.body.appendChild(form)
	return form
    },

    click_cb: function () {
        var form

	if (!(form = document.getElementById('input-num-dialog')))
	    form = this.create_input_dialog()

        var input = form.elements['value']

        input.value = this.expr.value
        form.style.visibility = 'visible'
        console.log(this.expr.value)

        var expr = this.expr

        form.onsubmit = function () {
            var value = input.value
            if (!value)
                return false
            expr.value = parseInt(value, 10)
            form.style.visibility = 'hidden'
            document.activeElement.blur()
            globals.source_canvas.redraw()
            paper.view.draw()

            return false
        }

        input.focus()
        input.select()
    },
})

globals.ListTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        var y = 0

        for (var i = 0; i < expr.data.length; ++i) {
            var p = expr.data[i].tile()
            p.set_position(new paper.Point(0, y))
            y += p.bounds.height + this.SPACING
            this.add_child(p)
        }

        var blank = new paper.Path.Rectangle(
            new paper.Point(0, 0), new paper.Size(100, y == 0 ? 30 : 18))
        blank.translate(
            blank.bounds.size.divide(2).add(new paper.Point(0, y)))
        this.add_child(blank)

        this.set_background(globals.colors.list)

	if (expr.parent.type == 'LIST')
            this.set_background('#F7F9FE', 5)

	/* List is not draggable if it is a block of a to expression. */
	if (expr.parent.type == 'TO')
	    this.on_drag_end = undefined
    },

    on_drag_end: function (overlap) {
	return this.replace_self(overlap)
    },

    on_drop: function (tile) {
        if (tile.expr.parent === this.expr)
            return

        tile.expr.parent = this.expr

        this.expr.data.push(tile.expr.clone())
    },
})

globals.ApplyTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        var name = new globals.Text(expr.name)

        this.add_child(name)

        var x = 0

        name.set_position(new paper.Point(x, this.SPACING))

        x += name.bounds.width + this.SPACING
        var y = 0
        expr.args.forEach(function (arg) {
            var p = arg.tile()
            p.set_position(new paper.Point(x, y))
            y += p.bounds.height + this.SPACING
            this.add_child(p)
        }, this)

        if (expr.name == 'repeat' || expr.name == 'ifelse')
            this.set_background(globals.colors.control, this.SPACING)
        else
            this.set_background(globals.colors.apply, this.SPACING)
    },

    on_drop: function (tile) {
        return this.replace_self(tile)
    },

    on_drag_end: function (overlap) {
	return this.replace_self(overlap)
    }
})

globals.ToVariableTile = globals.Tile.extend({
    initialize: function (name) {
	this.variable_name = name
        this.base(prototypes.variable.clone(name))
        this.add_child(new globals.Text(name, '#91897E'))
        this.set_background(globals.colors.to_name, this.SPACING)
    },

    clone: function () {
	var tile = new globals.ToVariableTile(this.variable_name)
	tile.position = this.position
	return tile
    },

    on_drag_end: function (overlap) {
    },
})

/**
   Word name tile
 */
globals.ToNameTile = globals.Tile.extend({
    initialize: function (to_expr) {
	this.to_expr = to_expr
        var name = to_expr.name

        var expr = prototypes.expr_apply.clone(name)
        for (var i = 0, l = to_expr.arg_names.length; i < l; ++i) {
            var nil = prototypes.nil.clone()
            nil.parent = expr
            expr.args.push(nil)
        }

        this.base(expr)

        this.add_child(new globals.Text(name))
        this.set_background(globals.colors.to_name, this.SPACING)
    },

    clone: function () {
	var tile = new globals.ToNameTile(this.to_expr)
	tile.position = this.position
	return tile
    },

    /**
       Click on name of a word definition tile will open a dialog to
       change word arguemnt names.
     */
    click_cb: function () {
        var form

	if (!(form = document.getElementById('input-word-desc-dialog')))
	    form = globals.NewToTile.prototype.create_description_dialog()
        var input = form.elements['desciption']

        form.style.visibility = 'visible'

        var expr = this.to_expr
        input.value = expr.name
        for (var i = 0, l = expr.arg_names.length; i < l; ++i)
            input.value += ' ' + expr.arg_names[i].slice(1)
        input.focus()
        input.select()

        form.onsubmit = function () {
            var content = input.value

            if (!content)
                return false

            var items = content.split(/\s+/)
            if (items.length < 1)
                return false

            expr.name = items[0]
            expr.arg_names = items.slice(1).map(function (arg) {
                return ':' + arg
            })

            form.style.visibility = 'hidden'
            document.activeElement.blur()
            globals.source_canvas.redraw()
            paper.view.draw()

            return false
        }
    },

    on_drag_end: function (overlap) {
    },
})

/**
   ToDeleteTile is a delete button used in word definition tile. When
   it is clicked, the word definition it belongs to will be deleted.
 */
globals.ToDeleteTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)
        this.add_child(new globals.Text('x', '#F37C78'))
        this.set_background(globals.colors.to_delete, 6, 0)
    },

    click_cb: function () {
	globals.source.remove_expression(this.expr)
    }
})

globals.ToTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        var x = this.SPACING

        if (expr.name != globals.main_word_name) {
            var to = new globals.Text(this.label('TO'), "#91897E")

            to.set_position(new paper.Point(x, this.SPACING * 2))

            this.add_child(to)

            x += to.bounds.width + this.SPACING

            var name = new globals.ToNameTile(expr)
            name.set_position(new paper.Point(x, 0))
            this.add_child(name)

            x += name.bounds.width + this.SPACING * 2
        }

        for (var i = 0; i < expr.arg_names.length; ++i) {
            var t = new globals.ToVariableTile(expr.arg_names[i])
            t.set_position(new paper.Point(x, 0))

            x += t.bounds.width + this.SPACING
            this.add_child(t)
        }

        var b = this.bounds
        var p = expr.block.tile()
        p.set_position(new paper.Point(this.SPACING * 2,
				       b.y + b.height + this.SPACING * 2))
        this.add_child(p)

        if (expr.name != globals.main_word_name) {
            var del = new globals.ToDeleteTile(expr)
            del.set_position(new paper.Point(
                Math.max(this.bounds.width - 20, x), this.SPACING))
            this.add_child(del)
        }

        if (expr.name != globals.main_word_name) {
            this.set_background(globals.colors.to, 3)
        }
    },
})

globals.VariableTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)
        this.add_child(new globals.Text(expr.name.toString()))
        this.set_background(globals.colors.argument, this.SPACING)
    },

    on_drag_end: function (overlap) {
	return this.replace_self(overlap)
    },

    on_drop: function (tile) {
        return this.replace_self(tile)
    },
})

globals.NilTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)
        this.add_child(new globals.Text('???', '#F37C78'))
        this.set_background('#F7F9FE')
    },

    on_drop: function (tile) {
        return this.replace_self(tile)
    },

    on_drag_end: function (overlap) {
	return this.replace_self(overlap)
    }
})

globals.ParenTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)
        this.add_child(expr.expr.tile())
    },
})

globals.InfixTile = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        var x = 0

        var left = expr.left.tile()
        left.set_background('white', 2)
        left.set_position(new paper.Point(x, 0))
        this.add_child(left)

        x += left.bounds.width + this.SPACING

        var op = new globals.Text(expr.op.toString(), '#91897E')
        op.set_position(new paper.Point(x, 5))
        this.add_child(op)

        x += op.bounds.width + this.SPACING

        var right = expr.right.tile()
        right.set_background('white', 2)
        right.set_position(new paper.Point(x, 0))
        this.add_child(right)

        this.set_background(globals.colors.infix, this.SPACING)
    },

    on_drag_end: function (overlap) {
	return this.replace_self(overlap)
    },

    on_drop: function (tile) {
        return this.replace_self(tile)
    },
})

globals.ControllerPanel = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        this.redraw()
    },

    redraw: function () {
        this.removeChildren()
        var tile = null

        var x = 0
        var running = globals.running
        var paused = globals.paused

        if (!running) {
            tile = new globals.SpeedTile()
            tile.translate(x, 0)
            this.add_child(tile)
            x += tile.bounds.width + 20

            tile = new globals.RunTile()
            tile.translate(x, 0)
            this.add_child(tile)
            x += tile.bounds.width + 20
        }

        if (running) {
            tile = new globals.StopTile()
            tile.translate(x, 0)
            this.add_child(tile)
            x += tile.bounds.width + 20
        }

        if (running && !paused) {
            tile = new globals.PauseTile()
            tile.translate(x, 0)
            this.add_child(tile)
            x += tile.bounds.width + 20
        }

        if (running && paused) {
            tile = new globals.ContinueTile()
            tile.translate(x, 0)
            this.add_child(tile)
            x += tile.bounds.width + 20
        }

        if (!running || (running && paused)) {
            tile = new globals.StepTile()
            tile.translate(x, 0)
            this.add_child(tile)
            x += tile.bounds.width + 20
        }

	x += 100

	tile = new globals.ViewSourceTile()
	tile.translate(x, 0)
	this.add_child(tile)
	x += tile.bounds.width + 20

        this.translate(globals.canvas.width / 2 - this.bounds.width / 2,
                       globals.canvas.height - this.bounds.height + 20)
    },
})

globals.PrototypePanel = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        this.redraw()
    },

    redraw: function () {
        var that = this
        this.removeChildren()

        var expr = null
        var tile = null

        var y = 0

        tile = new globals.NewToTile()
        tile.translate(0, y)
        this.add_child(tile)
        y += tile.bounds.height + 30

        var ops = ['+', '-', '*', '/', '<', '>', '=']
        var x = 0
        for (var i = 0; i < ops.length; ++i) {
            expr = prototypes.expr_infix.clone(ops[i])
            expr.left = prototypes.number.clone(0)
            expr.left.parent = expr
            expr.right = prototypes.number.clone(0)
            expr.right.parent = expr

            tile = new globals.ProtoTile(expr)
            tile.translate(x, y)
            x = (tile.bounds.width + 5) * ((i + 1) % 2)
            y += (tile.bounds.height + 5) * (i % 2)
            this.add_child(tile)
        }
        y += tile.bounds.height + 10

        tile = new globals.ProtoTile(prototypes.number.clone(0))
        tile.translate(0, y)
        y += tile.bounds.height + 10
        this.add_child(tile)


        tile = new globals.ProtoTile(prototypes.list.clone(0))
        tile.translate(0, y)
        y += tile.bounds.height + 10
        this.add_child(tile)

        var words = [ [this.label('repeat'), [prototypes.number.clone(0), prototypes.list.clone(0)]]
	              , [this.label('ifelse'), [prototypes.nil.clone(0), prototypes.list.clone(0), prototypes.list.clone(0)]]
                      , [this.label('forward'), [prototypes.number.clone(0)]]
		      , [this.label('right'), [prototypes.number.clone(0)]]
		      , [this.label('penup'), []]
		      , [this.label('pendown'), []]
		    ]
        words.forEach(function (arg) {
            var name = arg[0]
            var args = arg[1]
            expr = prototypes.expr_apply.clone(name)
            for (var i = 0; i < args.length; ++i) {
                args[i].parent = expr
                expr.args.push(args[i])
            }
            tile = new globals.ProtoTile(expr)
            tile.translate(0, y)
            y += tile.bounds.height + 10
            that.add_child(tile)
        })

        this.translate(new paper.Point(- this.bounds.x, 0))
        this.translate(globals.canvas.width - this.bounds.width, 50)
    },
})

globals.UserWordPanel = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        this.redraw()
    },

    redraw: function () {
        var that = this
        this.removeChildren()

        var y = 0

        globals.user_defined_words = []

        globals.source.forEach (function (to_expr) {
            if (to_expr.type != 'TO')
                return

            globals.user_defined_words.push(to_expr)

            if (to_expr.name === globals.main_word_name)
                return

            var expr = prototypes.expr_apply.clone(to_expr.name)
            for (var i = 0; i < to_expr.arg_names.length; ++i) {
                var nil = prototypes.nil.clone()
                nil.parent = expr
                expr.args.push(nil)
            }
            var tile = new globals.UserWordTile(expr, '#C1CC25')
            tile.translate(0, y)
            y += tile.bounds.height + 10
            if (to_expr.hide)
                tile.opacity = 0.6
            that.add_child(tile)
        })

        this.translate(new paper.Point(- this.bounds.x, 0))
        this.translate(new paper.Point(
	    globals.prototype_panel.bounds.x - this.bounds.width - 10,
	    115))
    },
})

globals.SourcePanel = globals.Tile.extend({
    initialize: function (expr) {
        this.base(expr)

        this.redraw()
    },

    redraw: function () {
        var that = this
        this.removeChildren()

        var y = 20

        globals.source.forEach (function (expr) {
            if (expr.type != 'TO' || expr.hide)
                return

            var path = expr.tile()
            path.translate(new paper.Point(- path.bounds.x, y))
            that.add_child(path)
            y += path.bounds.height + 30
        })

        this.translate(new paper.Point(- this.bounds.x, 0))
        this.translate(new paper.Point(
            globals.user_word_panel.bounds.x - this.bounds.width - 30, 0))
    },
})

traits.SourceCanvas = Self.trait([], {
    on_mouse_down: function (event) {
        var that = globals.source_canvas
	that.drag_data = {}
    },

    on_mouse_drag: function (event) {
        var that = globals.source_canvas
	var data = that.drag_data

	if (data.start) {
            data.tile.translate(event.delta)
	} else {
	    var tile = that.get_focus_tile(event)

	    if (!tile)
		return

            var expr = tile.expr

	    if (tile instanceof globals.ProtoTile
		|| tile instanceof globals.ToVariableTile
		|| tile instanceof globals.ToNameTile) {
		data.start =  true
		data.tile = tile.clone()
	    } else if (expr && expr.parent && expr.parent.type != 'TO') {
		data.start = true
		data.tile = tile
	    }

	    if (data.start) {
		data.tile.opacity = 0.5
		that.drag_layer.activate()
		that.drag_layer.addChild(data.tile)
	    }
	}
    },

    get_focus_tile: function (event) {
        var that = globals.source_canvas

        var res = that.main_layer.hitTest(event.point, {
            stroke: true,
            fill: true,
            tolerance: 0
        })

        if (res && res.type == 'center' && res.item)
            return res.item
	else
	    return null
    },

    on_mouse_up: function (event) {
        var that = globals.source_canvas

        that.main_layer.activate()

        var focus = that.get_focus_tile(event)

        if (that.drag_data.start) {
            var source = that.drag_data.tile
	    if (source === focus)
		return

            if (source.on_drag_end)
		source.on_drag_end(focus)

            if (focus && focus.on_drop)
		focus.on_drop(source)
        } else {
            if (focus && focus.click_cb) {
                focus.click_cb()
            }
	}

        that.redraw()
    },

    on_key_down: function (event) {
        if (document.activeElement !== document.body) {
            return
        }

        switch (event.key) {
        case 'enter':
	    if (globals.running)
		globals.StopTile.prototype.click_cb()
	    else
		globals.RunTile.prototype.click_cb()
            break
	case 'space':
	    globals.PauseTile.prototype.click_cb()
	    break
	case 'z':
            if (event.modifiers.control) {
		globals.source.restore()
		globals.source_canvas.redraw()
            }
            break
        }
    },

    on_mouse_move: function (event) {
        var tile = globals.source_canvas.get_focus_tile(event)

	if (tile && tile.click_cb) {
	    document.body.style.cursor = 'pointer'
        } else if (tile && tile.on_drag_end) {
	    document.body.style.cursor = 'move'
        } else {
	    document.body.style.cursor = 'default'
	}
    },

    on_frame: function (event) {
        if (globals.steps && globals.running && !globals.paused) {
            globals.time_passed += event.delta

            if (globals.time_passed > 1 / globals.steps.value) {
                globals.drawing_layer.activate()
                if (!globals.lang.step()) {
                    globals.running = false
                    globals.paused = false
                    globals.source_canvas.redraw()
                } else {
                    globals.running = true
                }
                globals.source_panel.redraw()
                paper.project.layers[0].activate()
                globals.time_passed = 0
            }
        }
    },

    clone: function () {
        var obj = Self.clone(this)

        return obj
    },

    redraw: function () {
        globals.source_canvas.drag_layer.removeChildren()

        globals.controller_panel.redraw()

        globals.user_word_panel.redraw()

        globals.source_panel.redraw()
    },

    draw_source: function () {
        globals.canvas = document.getElementById("canvas")

        globals.canvas.width = window.innerWidth - 30
        globals.canvas.height = window.innerHeight - 30

        paper.setup(globals.canvas)

        var tool = new paper.Tool()

        tool.onMouseDown = this.on_mouse_down
        tool.onMouseDrag = this.on_mouse_drag
        tool.onMouseUp = this.on_mouse_up
	tool.onMouseMove = this.on_mouse_move
        tool.onKeyDown = this.on_key_down
        paper.view.onFrame = this.on_frame


        globals.steps = prototypes.number.clone(3)

        globals.time_passed = 0

        globals.prototype_panel = new globals.PrototypePanel()
        globals.user_word_panel = new globals.UserWordPanel()
        globals.source_panel = new globals.SourcePanel()
        globals.controller_panel = new globals.ControllerPanel()

        if (paper.project.layers.length < 2)
            new paper.Layer()

        if (paper.project.layers.length < 3)
            new paper.Layer()

        this.main_layer = paper.project.layers[0]
        this.drag_layer = paper.project.layers[1]
        globals.drawing_layer = paper.project.layers[2]

        this.redraw()

        paper.view.draw()
    },
})

prototypes.source_canvas = Self.prototype(traits.SourceCanvas, {
    drag_layer: null,
    main_layer: null
})

globals.source.import(globals.sample)

globals.source_canvas = prototypes.source_canvas.clone()
