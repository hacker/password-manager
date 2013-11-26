#!/usr/bin/env python
# -*- coding: UTF-8 -*-

import os
import shutil
from scriptLanguageBuilder import ScriptLanguageBuilder

class NodeBuilder(ScriptLanguageBuilder):
	
	def name(self):
		return "Node builder"

	def relativePath(self):
		return 'node'

	def frontEndTempFolder (self):
		return os.path.join(self.tempFolder(),'htdocs')

	def compileCode (self):
		src = self.sourceFolder()
		dst = self.tempFolder()

		shutil.copytree(src, dst, ignore = shutil.ignore_patterns('htdocs','node_modules'))

