#!/usr/bin/env python
# -*- coding: UTF-8 -*-

import os
import shutil
from backendBuilder import BackendBuilder

class ScriptLanguageBuilder(BackendBuilder):

	def frontEndTempFolder (self):
		return os.path.join(self.tempFolder(),'htdocs')

	def compileCode (self):
		src = self.sourceFolder()
		dst = self.tempFolder()

		shutil.copytree(src, dst)


	def createPackage (self):
		src = self.tempFolder()
		dst = self.targetFolder()

		shutil.copytree(src, dst)
